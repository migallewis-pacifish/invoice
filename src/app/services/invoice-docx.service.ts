import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { InvoiceData, InvoiceItem } from '../models/invoice.model';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { Observable, catchError, from, map, switchMap, tap, throwError } from 'rxjs';
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
  generateAndDownload(
    companyId: string,
    data: Omit<
      InvoiceData,
      'excluding_vat' | 'vat_amount' | 'total' | 'invoice_number' | 'vat_percentage'
    > & { invoice_number: string }
  ): Observable<string> {

    console.log('Generating invoice for companyId:', companyId);
    // Step 1: Get templatePath from Firestore
    const companyDoc = doc(this.db, `companies/${companyId}`);
    return docData(companyDoc).pipe(
      map((c: any) => c?.templatePath),
      switchMap(templatePath => {
        if (!templatePath) {
          return throwError(() => new Error('No templatePath found for company.'));
        }
        // Step 2: Get download URL from Firebase Storage
        const templateRef = ref(this.storage, templatePath);
        return from(getDownloadURL(templateRef));
      }),
      // Step 3: Fetch the .docx template as ArrayBuffer
      switchMap((url: string) => this.http.get(url, { responseType: 'arraybuffer' })),
      // Step 4: Fill and download the invoice
      map(arrayBuffer => {
        const { items, subtotalStr, vatStr, grandStr } = this.computeTotals(data.items);
        const finalData: InvoiceData = {
          invoice_number: data.invoice_number,
          invoice_date: data.invoice_date,
          client_name: data.client_name,
          client_building: data.client_building || '',
          client_street: data.client_street || '',
          client_suburb: data.client_suburb || '',
          client_city: data.client_city || '',
          client_post_code: data.client_post_code || '',
          client_contact_no: data.client_contact_no || '',
          services_rendered: data.services_rendered || '',
          client_email: data.client_email || '',
          items,
          excluding_vat: subtotalStr,
          vat_amount: vatStr,
          vat_percentage: this.VAT_RATE.toString(),
          notes: data.notes,
          total: grandStr,
          reference: data.reference || '',
        };
        console.log('Final invoice data:', finalData);
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
        saveAs(out, fileName);
        return fileName;
      }),
      catchError(err => {
        console.error('Invoice generation error:', err);
        return throwError(() => new Error('Failed to generate invoice document.'));
      })
    );
  }
}
