import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { InvoiceData, InvoiceItem, Company } from '../models/invoice.model';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { Observable, catchError, from, map, switchMap, take, throwError } from 'rxjs';
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

    return this.generateInvoiceDocx(companyId, data).pipe(
      switchMap(({ blob, company, fileName }) =>
        from(this.saveLocally(blob, company, data.client_name, fileName)).pipe(map(() => fileName))
      ),
      catchError(err => {
        console.error('Invoice generation error:', err);
        return throwError(() => new Error('Failed to generate invoice document.'));
      })
    );
  }

  private generateInvoiceDocx(
    companyId: string,
    data: Omit<
      InvoiceData,
      'excluding_vat' | 'vat_amount' | 'total' | 'invoice_number' | 'vat_percentage'
    > & { invoice_number: string; includeVat?: boolean }
  ): Observable<{ blob: Blob; company: Company; fileName: string }> {
    console.log('generating invoice for company:', companyId);

    const companyDoc = doc(this.db, `companies/${companyId}`);
    return docData(companyDoc).pipe(
      take(1),
      switchMap((companyRaw: any) => {
        if (!companyRaw) {
          return throwError(() => new Error('Company not found.'));
        }
        const company = companyRaw as Company;
        const templatePath = company?.templatePath;
        if (!templatePath) {
          return throwError(() => new Error('No templatePath found for company.'));
        }
        const templateRef = ref(this.storage, templatePath);
        return from(getDownloadURL(templateRef)).pipe(
          map(url => ({ url, company }))
        );
      }),
      switchMap(({ url, company }) =>
        this.http.get(url, { responseType: 'arraybuffer' }).pipe(
          map(arrayBuffer => ({ arrayBuffer, company }))
        )
      ),
      map(({ arrayBuffer, company }) => {
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
          excluding_vat: fmt(subtotalNum),
          vat_amount: fmt(vatNum),
          vat_percentage: (this.VAT_RATE * 100).toString(),
          notes: data.notes,
          total: fmt(grandNum),
          reference: data.reference || '',
        };
        const zip = new PizZip(arrayBuffer as ArrayBuffer);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
        doc.setData(finalData);
        doc.render();
        const blob = doc.getZip().generate({
          type: 'blob',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        return { blob, company, fileName: `${finalData.invoice_number}.docx` };
      })
    );
  }

  async generatePdf(
    companyId: string,
    data: Omit<InvoiceData, 'excluding_vat' | 'vat_amount' | 'total' | 'invoice_number' | 'vat_percentage'> & { invoice_number: string; includeVat?: boolean }
  ): Promise<void> {
    const { blob } = await new Promise<{ blob: Blob; company: Company; fileName: string }>((resolve, reject) => {
      this.generateInvoiceDocx(companyId, data).subscribe({
        next: resolve,
        error: reject
      });
    });

    saveAs(blob, `${data.invoice_number}.docx`);

    const objectUrl = URL.createObjectURL(blob);
    const conversionWindow = window.open(objectUrl, '_blank');
    if (!conversionWindow) {
      URL.revokeObjectURL(objectUrl);
      throw new Error('Unable to open the generated Word invoice for PDF export.');
    }

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    window.alert('The invoice was generated from your Word template and downloaded as a .docx file. Please use Word or your browser\'s document viewer to Save/Export it as PDF so the PDF matches the template exactly.');
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char] || char));
  }

  async saveLocally(file: Blob, company: Company, clientName: string, fileName: string): Promise<void> {
    if (!company.storagePath) throw new Error('No storagePath defined for company');
    // Simulate folder structure in filename
    const fullFileName = `${clientName}/${fileName}`;
    saveAs(file, fullFileName);
  }
}
