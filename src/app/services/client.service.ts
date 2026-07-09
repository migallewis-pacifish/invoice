import { inject, Injectable } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { collectionData, docData, Firestore } from '@angular/fire/firestore';
import { addDoc, collection, doc, getDoc, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Client, ClientUpdate } from '../models/client.model';
import { ActivityService } from './activity.service';
import { InvoiceRecord } from '../models/invoice.model';
import { combineLatest, defer, from, map, Observable, of, switchMap, throwError } from 'rxjs';


export interface ClientInvoiceSummary {
  outstandingBalance: number;
  overdueAmount: number;
  nextDueDate: number | null;
  isSettled: boolean;
  invoiceCount: number;
}

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return null;
}

export function calculateClientInvoiceSummary(
  invoices: Pick<InvoiceRecord, 'total' | 'amountPaid' | 'status' | 'dueDate'>[],
  now: Date = new Date()
): ClientInvoiceSummary {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return invoices.reduce<ClientInvoiceSummary>((summary, invoice) => {
    const total = Number(invoice.total ?? 0) || 0;
    const amountPaid = Number(invoice.amountPaid ?? 0) || 0;
    const balance = Math.max(total - amountPaid, 0);
    const isPaid = invoice.status === 'paid' || balance <= 0;
    const dueAt = toMillis(invoice.dueDate);

    summary.invoiceCount += 1;
    summary.outstandingBalance += isPaid ? 0 : balance;

    if (!isPaid && dueAt !== null) {
      const due = new Date(dueAt);
      due.setHours(0, 0, 0, 0);
      if (due.getTime() < today.getTime()) {
        summary.overdueAmount += balance;
      } else if (summary.nextDueDate === null || dueAt < summary.nextDueDate) {
        summary.nextDueDate = dueAt;
      }
    }

    summary.isSettled = summary.outstandingBalance <= 0;
    return summary;
  }, {
    outstandingBalance: 0,
    overdueAmount: 0,
    nextDueDate: null,
    isSettled: true,
    invoiceCount: 0,
  });
}

@Injectable({
  providedIn: 'root'
})
export class ClientService {

  private auth = inject(Auth);
  private db = inject(Firestore);
  private activityService = inject(ActivityService);

  /** Reads companyId from users/{uid} */
  private companyContext$(): Observable<{ userId: string; companyId: string }> {
    return defer(() => {
      const user = this.auth.currentUser;
      if (!user) {
        return throwError(() => new Error('Not authenticated'));
      }
      const userDoc = doc(this.db, `users/${user.uid}`);
      return from(getDoc(userDoc)).pipe(
        map(snap => {
          if (!snap.exists()) throw new Error('User profile not found');
          const data = snap.data() as any;
          const companyId = data?.companyId as string | undefined;
          if (!companyId) throw new Error('User has no companyId');
          return { userId: user.uid, companyId };
        })
      );
    });
  }

  private getCompanyId$(): Observable<string> {
    return this.companyContext$().pipe(map(ctx => ctx.companyId));
  }

  getClientById(id: string): Observable<Client | null> {
    return this.getCompanyId$().pipe(
      switchMap(companyId => from(getDoc(doc(this.db, `companies/${companyId}/clients/${id}`)))),
      map(snap => (snap.exists() ? this.toClient({ id: snap.id, ...snap.data() }) : null))
    );
  }

  /** 🔹 Get invoices for a client (live) */
  getInvoicesForClient(id: string): Observable<any[]> {
    return this.getCompanyId$().pipe(
      switchMap(companyId => {
        const ref = collection(this.db, `companies/${companyId}/clients/${id}/invoices`);
        const q = query(ref, orderBy('createdAt', 'desc'));
        return collectionData(q, { idField: 'id' }).pipe(
          map((arr: any[] | undefined) => arr ?? [])
        );
      })
    );
    // return of([]);
  }


  getInvoicesForCompany(): Observable<InvoiceRecord[]> {
    return this.clients$().pipe(
      switchMap(clients => clients.length
        ? combineLatest(clients.map(client => this.getInvoicesForClient(client.id)))
        : of([])
      ),
      map(invoiceGroups => (invoiceGroups as InvoiceRecord[][]).flat())
    );
  }

  getClientInvoiceSummaries(): Observable<Record<string, ClientInvoiceSummary>> {
    return this.clients$().pipe(
      switchMap(clients => clients.length
        ? combineLatest(clients.map(client => this.getInvoicesForClient(client.id).pipe(
          map(invoices => [client.id, calculateClientInvoiceSummary(invoices as InvoiceRecord[])] as const)
        )))
        : of([])
      ),
      map(entries => Object.fromEntries(entries))
    );
  }

  createInvoice(clientId: string, data: any): Observable<string> {
    console.log('creating invoice for client:', clientId);
    return this.getCompanyId$().pipe(
      switchMap(companyId => {
        const colRef = collection(this.db, `companies/${companyId}/clients/${clientId}/invoices`);
        const amountPaid = Number(data?.amountPaid ?? 0) || 0;
        return from(this.activityService.track(
          companyId,
          'create',
          `companies/${companyId}/clients/${clientId}/invoices`,
          `Created invoice ${data?.invoiceNumber || data?.filename || 'draft'} for client ${clientId}.`,
          () => addDoc(colRef, {
            ...data,
            amountPaid,
            status: data?.status || (amountPaid > 0 ? 'partial' : 'sent'),
            updatedAt: data?.updatedAt || serverTimestamp(),
          })
        )).pipe(map(ref => ref.id));
      })
    );
  }

  updateInvoiceTracking(clientId: string, invoiceId: string, data: { amountPaid: number; status: string; dueDate?: any; paidAt?: any }): Observable<void> {
    return this.getCompanyId$().pipe(
      switchMap(companyId => {
        const invoiceRef = doc(this.db, `companies/${companyId}/clients/${clientId}/invoices/${invoiceId}`);
        return from(this.activityService.track(
          companyId,
          'update',
          `companies/${companyId}/clients/${clientId}/invoices/${invoiceId}`,
          `Updated invoice ${invoiceId} tracking to ${data.status}.`,
          () => updateDoc(invoiceRef, {
            ...data,
            updatedAt: serverTimestamp(),
          })
        ));
      })
    );
  }

  getLettersForClient(id: string): Observable<any[]> {
    return this.getCompanyId$().pipe(
      switchMap(companyId => {
        const ref = collection(this.db, `companies/${companyId}/clients/${id}/letters`);
        const q = query(ref, orderBy('createdAt', 'desc'));
        return collectionData(q, { idField: 'id' }).pipe(
          map((arr: any[] | undefined) => arr ?? [])
        );
      })
    );
  }

  createLetter(clientId: string, data: any): Observable<string> {
    return this.getCompanyId$().pipe(
      switchMap(companyId => {
        const colRef = collection(this.db, `companies/${companyId}/clients/${clientId}/letters`);
        return from(this.activityService.track(
          companyId,
          'create',
          `companies/${companyId}/clients/${clientId}/letters`,
          `Created letter ${data?.title || 'record'} for client ${clientId}.`,
          () => addDoc(colRef, data)
        )).pipe(map(ref => ref.id));
      })
    );
  }

  /** Creates a client under companies/{companyId}/clients */
  createClient(payload: Omit<Client, 'id' | 'createdAt' | 'createdBy'>): Observable<string> {
    return this.companyContext$().pipe(
      switchMap(({ userId, companyId }) => {
        const colRef = collection(this.db, `companies/${companyId}/clients`);
        return from(this.activityService.track(
          companyId,
          'create',
          `companies/${companyId}/clients`,
          `Created client ${payload.displayName}.`,
          () => addDoc(colRef, {
            ...payload,
            createdAt: serverTimestamp(),
            createdBy: userId,
          })
        )).pipe(map(docRef => docRef.id));
      })
    );
  }


  updateClient(clientId: string, payload: ClientUpdate): Observable<void> {
    return this.companyContext$().pipe(
      switchMap(({ companyId }) => {
        const clientRef = doc(this.db, `companies/${companyId}/clients/${clientId}`);
        return from(this.activityService.track(
          companyId,
          'update',
          `companies/${companyId}/clients/${clientId}`,
          `Updated client ${payload.displayName || clientId}.`,
          () => updateDoc(clientRef, {
            ...payload,
            updatedAt: serverTimestamp(),
          })
        ));
      })
    );
  }

  clients$(): Observable<Client[]> {
    return authState(this.auth).pipe(
      switchMap(user => {
        if (!user) return of([]);
        const userDoc = doc(this.db, `users/${user.uid}`);
        return docData(userDoc).pipe(
          switchMap((u: any) => {
            const companyId = u?.companyId as string | undefined;
            if (!companyId) return of([]);
            const col = collection(this.db, `companies/${companyId}/clients`);
            const q = query(col, orderBy('displayName'));
            return collectionData(q, { idField: 'id' }).pipe(
              map((arr: any[]) =>
                arr.map(x => this.toClient(x))
              )
            );
          })
        );
      })
    );
  }
  private toClient(data: any): Client {
    return {
      ...data,
      createdAt: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : data.createdAt ?? 0,
    } as Client;
  }

}
