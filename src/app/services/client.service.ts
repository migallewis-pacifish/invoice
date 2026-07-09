import { inject, Injectable } from '@angular/core';
import { collectionData, Firestore } from '@angular/fire/firestore';
import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Client, ClientUpdate } from '../models/client.model';
import { ActivityService } from './activity.service';
import { CompanyContextService } from './company-context.service';
import { InvoiceRecord, InvoiceSummaryRecord } from '../models/invoice.model';
import { combineLatest, from, map, Observable, of, switchMap } from 'rxjs';


export interface ClientInvoiceSummary {
  outstandingBalance: number;
  overdueAmount: number;
  nextDueDate: number | null;
  isSettled: boolean;
  invoiceCount: number;
}

type InvoiceSummaryInput = Partial<InvoiceRecord> & Pick<InvoiceRecord, 'total' | 'amountPaid' | 'status'>;

function withoutUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T;
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

export function buildInvoiceSummaryRecord(
  invoiceId: string,
  clientId: string,
  invoice: InvoiceSummaryInput
): InvoiceSummaryRecord {
  const total = Number(invoice.total ?? 0) || 0;
  const amountPaid = Number(invoice.amountPaid ?? 0) || 0;

  return withoutUndefined({
    id: invoiceId,
    clientId,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date,
    filename: invoice.filename,
    total,
    amountPaid,
    creditAmount: invoice.creditAmount,
    refundAmount: invoice.refundAmount,
    overpaidAmount: invoice.overpaidAmount,
    status: invoice.status,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    updatedAt: invoice.updatedAt,
    createdAt: invoice.createdAt,
    createdBy: invoice.createdBy,
  });
}

export function mergeInvoiceTrackingUpdate(
  currentInvoice: Partial<InvoiceRecord>,
  trackingUpdate: Partial<InvoiceRecord>
): InvoiceSummaryInput {
  return {
    ...currentInvoice,
    ...trackingUpdate,
    total: Number(trackingUpdate.total ?? currentInvoice.total ?? 0) || 0,
    amountPaid: Number(trackingUpdate.amountPaid ?? currentInvoice.amountPaid ?? 0) || 0,
    status: trackingUpdate.status ?? currentInvoice.status ?? 'sent',
  };
}

@Injectable({
  providedIn: 'root'
})
export class ClientService {

  private db = inject(Firestore);
  private activityService = inject(ActivityService);
  private companyContext = inject(CompanyContextService);

  private companyContext$() {
    return this.companyContext.currentContext$().pipe(
      map(ctx => ({ userId: ctx.user.uid, companyId: ctx.companyId }))
    );
  }

  private getCompanyId$(): Observable<string> {
    return this.companyContext.currentContext$().pipe(map(ctx => ctx.companyId));
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
    return this.getCompanyId$().pipe(
      switchMap(companyId => {
        const ref = collection(this.db, `companies/${companyId}/invoiceSummaries`);
        return collectionData(ref, { idField: 'id' }).pipe(
          map((arr: any[] | undefined) => (arr ?? []) as InvoiceRecord[])
        );
      })
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
    return this.getCompanyId$().pipe(
      switchMap(companyId => {
        const colRef = collection(this.db, `companies/${companyId}/clients/${clientId}/invoices`);
        const amountPaid = Number(data?.amountPaid ?? 0) || 0;
        const status = data?.status || (amountPaid > 0 ? 'partial' : 'sent');
        const updatedAt = data?.updatedAt || serverTimestamp();
        return from(this.activityService.track(
          companyId,
          'create',
          `companies/${companyId}/clients/${clientId}/invoices`,
          `Created invoice ${data?.invoiceNumber || data?.filename || 'draft'} for client ${clientId}.`,
          async () => {
            const invoiceRef = await addDoc(colRef, {
              ...data,
              amountPaid,
              status,
              updatedAt,
            });
            await this.upsertInvoiceSummary(companyId, clientId, invoiceRef.id, {
              ...data,
              amountPaid,
              status,
              updatedAt,
            });
            return invoiceRef;
          }
        )).pipe(map(ref => ref.id));
      })
    );
  }

  backfillInvoiceSummaries(): Observable<number> {
    return this.getCompanyId$().pipe(
      switchMap(companyId => this.clients$().pipe(
        switchMap(async clients => {
          let migrated = 0;
          for (const client of clients) {
            const invoicesRef = collection(this.db, `companies/${companyId}/clients/${client.id}/invoices`);
            const invoices = await getDocs(invoicesRef);
            for (const invoiceDoc of invoices.docs) {
              await this.upsertInvoiceSummary(companyId, client.id, invoiceDoc.id, invoiceDoc.data() as InvoiceRecord);
              migrated += 1;
            }
          }
          return migrated;
        })
      ))
    );
  }

  private async upsertInvoiceSummary(
    companyId: string,
    clientId: string,
    invoiceId: string,
    invoice: InvoiceSummaryInput
  ): Promise<void> {
    const summaryRef = doc(this.db, `companies/${companyId}/invoiceSummaries/${invoiceId}`);
    await setDoc(summaryRef, buildInvoiceSummaryRecord(invoiceId, clientId, invoice), { merge: true });
  }

  updateInvoiceTracking(clientId: string, invoiceId: string, data: { amountPaid: number; status: string; dueDate?: any; paidAt?: any; creditAmount?: number; refundAmount?: number; overpaidAmount?: number; paymentHistory?: any[] }): Observable<void> {
    return this.getCompanyId$().pipe(
      switchMap(companyId => {
        const invoiceRef = doc(this.db, `companies/${companyId}/clients/${clientId}/invoices/${invoiceId}`);
        return from(this.activityService.track(
          companyId,
          'update',
          `companies/${companyId}/clients/${clientId}/invoices/${invoiceId}`,
          `Updated invoice ${invoiceId} tracking to ${data.status}.`,
          async () => {
            const updatedAt = serverTimestamp();
            await updateDoc(invoiceRef, {
              ...data,
              updatedAt,
            });
            const invoiceSnap = await getDoc(invoiceRef);
            const currentInvoice = invoiceSnap.exists() ? invoiceSnap.data() as InvoiceRecord : {};
            await this.upsertInvoiceSummary(
              companyId,
              clientId,
              invoiceId,
              mergeInvoiceTrackingUpdate(currentInvoice, { ...data, updatedAt } as Partial<InvoiceRecord>)
            );
          }
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
    return this.companyContext.currentCompanyId$().pipe(
      switchMap(companyId => {
        if (!companyId) return of([]);
        const col = collection(this.db, `companies/${companyId}/clients`);
        const q = query(col, orderBy('displayName'));
        return collectionData(q, { idField: 'id' }).pipe(
          map((arr: any[]) => arr.map(x => this.toClient(x)))
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
