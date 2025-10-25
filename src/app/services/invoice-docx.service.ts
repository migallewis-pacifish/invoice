import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { InvoiceData, InvoiceItem, Company } from '../models/invoice.model';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { Observable, catchError, from, map, switchMap, tap, throwError, lastValueFrom } from 'rxjs';
import { doc, docData, Firestore, getDoc } from '@angular/fire/firestore';
import { getDownloadURL, ref, Storage } from '@angular/fire/storage';

@Injectable({
  providedIn: 'root'
})
export class InvoiceDocxService {

  private templateUrl = 'templates/DhlebelaInc.docx';
  private VAT_RATE = 0.15;
  private storage = inject(Storage);
  private http = inject(HttpClient);
  private db = inject(Firestore);

  private computeTotals(items: InvoiceItem[]) {
    // compute per-line totals if missing
    const normalized = items.map(i => ({
      ...i,
      amount: (parseFloat(i.rate) * parseFloat(i.hours)).toFixed(2),
    }));
    const subtotalNum = normalized.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const vatNum = +(subtotalNum * this.VAT_RATE).toFixed(2);
    const grandNum = +(subtotalNum + vatNum).toFixed(2);

    // Format money as ZAR
    const fmt = (n: number) =>
      new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n);

    return {
      items: normalized.map(i => ({ ...i, amount: fmt(parseFloat(i.amount)) })),
      subtotalStr: fmt(subtotalNum),
      vatStr: fmt(vatNum),
      grandStr: fmt(grandNum),
    };
  }

  /**
    * 🔹 Generates an invoice document using the company template stored in Firestore.
    * @param companyId The company whose template to use
    * @param data Invoice data object
    */
  generateAndSave(
    companyId: string,
    data: Omit<
      InvoiceData,
      'excluding_vat' | 'vat_amount' | 'total' | 'invoice_number' | 'vat_percentage'
    > & { invoice_number: string; includeVat?: boolean }
  ): Observable<string> {
    const companyDoc = doc(this.db, `companies/${companyId}`);
    return docData(companyDoc).pipe(
      switchMap((companyRaw: any) => {
        if (!companyRaw) {
          return throwError(() => new Error('Company not found.'));
        }
        const company = companyRaw as Company;
        const templatePath = company?.templatePath;
        if (!templatePath) {
          return throwError(() => new Error('No templatePath found for company.'));
        }
        // Step 2: Get download URL from Firebase Storage
        const templateRef = ref(this.storage, templatePath);
        return from(getDownloadURL(templateRef)).pipe(
          map(url => ({ url, company }))
        );
      }),
      // Step 3: Fetch the .docx template as ArrayBuffer
      switchMap(({ url, company }) =>
        this.http.get(url, { responseType: 'arraybuffer' }).pipe(
          map(arrayBuffer => ({ arrayBuffer, company }))
        )
      ),
      // Step 4: Fill and save the invoice
      switchMap(({ arrayBuffer, company }) => {
        const shouldIncludeVAT = data.includeVat ?? data.shouldIncludeVAT ?? false;
        const normalized = data.items.map((i: any) => ({
          ...i,
          amount: (parseFloat(i.rate) * parseFloat(i.hours)).toFixed(2),
        }));
        const subtotalNum = normalized.reduce((s: number, i: any) => s + (parseFloat(i.amount) || 0), 0);
        const vatNum = shouldIncludeVAT ? +(subtotalNum * this.VAT_RATE).toFixed(2) : 0;
        const grandNum = +(subtotalNum + vatNum).toFixed(2);
        const fmt = (n: number) =>
          new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n);
        const items = normalized.map((i: any) => ({ ...i, amount: fmt(parseFloat(i.amount)) }));
        const subtotalStr = fmt(subtotalNum);
        const vatStr = fmt(vatNum);
        const grandStr = fmt(grandNum);
        const finalData: InvoiceData = {
          invoice_number: data.invoice_number,
          invoice_date: data.invoice_date,
          client_name: data.client_name,
          client_building: data.client_building || '',
          client_street: data.client_street || '',
          client_suburb: data.client_suburb || '',
          client_city: data.client_city || '',
          client_postal_code: data.client_postal_code || '',
          client_contact_no: data.client_contact_no || '',
          services_rendered: data.services_rendered || '',
          client_email: data.client_email || '',
          items,
          excluding_vat: subtotalStr,
          vat_amount: vatStr,
          vat_percentage: (this.VAT_RATE * 100).toString(),
          notes: data.notes,
          total: grandStr,
          reference: data.reference || '',
        };
        const zip = new PizZip(arrayBuffer as ArrayBuffer);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
        doc.setData(finalData);
        doc.render();
        const out = doc.getZip().generate({
          type: 'blob',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        const fileName = `${finalData.invoice_number}.docx`;
        // Call appropriate save method
        if (company.storageProvider === 'onedrive') {
          return from(this.saveToOneDrive(/* params */)).pipe(map(() => fileName));
        } else if (company.storageProvider === 'google') {
          return from(this.saveToGoogleDrive(/* params */)).pipe(map(() => fileName));
        } else {
          // Default: local
          return from(this.saveLocally(out, company, data.client_name, fileName)).pipe(map(() => fileName));
        }
      }),
      catchError(err => {
        console.error('Invoice generation error:', err);
        return throwError(() => new Error('Failed to generate invoice document.'));
      })
    );
  }

  async saveLocally(file: Blob, company: Company, clientName: string, fileName: string): Promise<void> {
    if (!company.storagePath) throw new Error('No storagePath defined for company');
    // Simulate folder structure in filename
    const fullFileName = `${clientName}/${fileName}`;
    saveAs(file, fullFileName);
  }

  async saveToOneDrive(/* params */): Promise<void> {
    // TODO: Implement OneDrive save logic
    throw new Error('Not implemented');
  }

  async saveToGoogleDrive(/* params */): Promise<void> {
    // TODO: Implement Google Drive save logic
    throw new Error('Not implemented');
  }
}
