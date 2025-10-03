import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { InvoiceData, InvoiceItem } from '../models/invoice.model';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';

@Injectable({
  providedIn: 'root'
})
export class InvoiceDocxService {

  private templateUrl = 'assets/invoice-template.docx';
  private VAT_RATE = 0.15;

  constructor(private http: HttpClient) { }

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

  private nextInvoiceNumber(): string {
    const key = 'dhlebelainc_last_invoice_no';
    const last = Number(localStorage.getItem(key) || '1000');
    const next = last + 1;
    localStorage.setItem(key, String(next));
    return `DHI-${next}`;
  }

  async generateAndDownload(data: Omit<InvoiceData, 'subtotal' | 'vat' | 'grand_total' | 'invoice_number'> & { invoice_number?: string }) {
    const arrayBuffer = await this.http.get(this.templateUrl, { responseType: 'arraybuffer' }).toPromise();

    const { items, subtotalStr, vatStr, grandStr } = this.computeTotals(data.items);

    const finalData: InvoiceData = {
      invoice_number: data.invoice_number ?? this.nextInvoiceNumber(),
      invoice_date: data.invoice_date,
      client_name: data.client_name,
      client_building: data.client_building,
      client_street: data.client_street,
      client_suburb: data.client_suburb,
      client_city: data.client_city,
      client_post_code: data.client_post_code,
      client_contact_no: data.client_contact_no,
      services_rendered: data.services_rendered,
      client_email: data.client_email,
      items,
      excluding_vat: subtotalStr,
      vat_amount: vatStr,
      vat_percentage: this.VAT_RATE.toString(),
      notes: data.notes,
      total: grandStr,
    };

    const zip = new PizZip(arrayBuffer as ArrayBuffer);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    doc.setData(finalData);
    doc.render();
    const out = doc.getZip().generate({
      type: 'blob', mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    const fileName = `${finalData.invoice_number}.docx`;
    saveAs(out, fileName);
    return fileName;
  }
}
