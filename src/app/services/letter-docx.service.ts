import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Firestore, doc, docData, updateDoc } from '@angular/fire/firestore';
import { getDownloadURL, ref, Storage, uploadBytes } from '@angular/fire/storage';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import PizZip from 'pizzip';
import { catchError, from, map, Observable, switchMap, take, throwError } from 'rxjs';
import { Company } from '../models/invoice.model';
import { LetterData, LetterSignature } from '../models/letter.model';
import { ActivityService } from './activity.service';

@Injectable({ providedIn: 'root' })
export class LetterDocxService {
  private storage = inject(Storage);
  private http = inject(HttpClient);
  private db = inject(Firestore);
  private activityService = inject(ActivityService);

  uploadTemplate(companyId: string, file: File): Promise<{ path: string; url: string }> {
    this.assertDocx(file);
    const path = `companies/${companyId}/templates/letter.docx`;
    const storageRef = ref(this.storage, path);
    return uploadBytes(storageRef, file, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }).then(async () => {
      const url = await getDownloadURL(storageRef);
      await this.activityService.track(
        companyId,
        'update',
        `companies/${companyId}`,
        'Updated letter template.',
        () => updateDoc(doc(this.db, `companies/${companyId}`), { letterTemplatePath: path })
      );
      return { path, url };
    });
  }

  uploadSignature(companyId: string, name: string, file: File): Promise<LetterSignature> {
    if (!name?.trim()) throw new Error('Signature name is required.');
    if (!file?.type?.startsWith('image/')) throw new Error('Signature must be an image file.');

    const safeName = name.trim().replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    const ext = file.name.split('.').pop() || 'png';
    const signature: LetterSignature = {
      id: `${Date.now()}-${safeName}`,
      name: name.trim(),
      path: `companies/${companyId}/signatures/${Date.now()}-${safeName}.${ext}`,
      createdAt: Date.now()
    };
    const storageRef = ref(this.storage, signature.path);
    return uploadBytes(storageRef, file, { contentType: file.type }).then(async () => {
      signature.url = await getDownloadURL(storageRef);
      const companyRef = doc(this.db, `companies/${companyId}`);
      const snap: any = await new Promise(resolve => docData(companyRef).pipe(take(1)).subscribe(resolve));
      await this.activityService.track(
        companyId,
        'update',
        `companies/${companyId}`,
        `Added signature ${signature.name}.`,
        () => updateDoc(companyRef, { signatures: [...(snap?.signatures || []), signature] })
      );
      return signature;
    });
  }

  generateAndSave(companyId: string, input: {
    title: string;
    message: string;
    client: any;
    signedBy?: string;
    signature?: LetterSignature | null;
  }): Observable<string> {
    return this.generateLetterDocx(companyId, input).pipe(
      map(({ blob, fileName }) => {
        saveAs(blob, `${input.client?.displayName || 'client'}/${fileName}`);
        return fileName;
      }),
      catchError(err => {
        console.error('Letter generation error:', err);
        return throwError(() => new Error('Failed to generate letter document.'));
      })
    );
  }

  private generateLetterDocx(companyId: string, input: {
    title: string;
    message: string;
    client: any;
    signedBy?: string;
    signature?: LetterSignature | null;
  }): Observable<{ blob: Blob; fileName: string }> {
    const companyDoc = doc(this.db, `companies/${companyId}`);
    return docData(companyDoc).pipe(
      take(1),
      switchMap((companyRaw: any) => {
        if (!companyRaw) return throwError(() => new Error('Company not found.'));
        const company = companyRaw as Company & { letterTemplatePath?: string };
        if (!company.letterTemplatePath) return throwError(() => new Error('No letter template uploaded for company.'));
        return from(getDownloadURL(ref(this.storage, company.letterTemplatePath))).pipe(map(url => ({ url, company })));
      }),
      switchMap(({ url, company }) => this.http.get(url, { responseType: 'arraybuffer' }).pipe(map(arrayBuffer => ({ arrayBuffer, company })))),
      map(({ arrayBuffer, company }) => {
        const data = this.buildTemplateData(company, input);
        const zip = new PizZip(arrayBuffer as ArrayBuffer);
        const docx = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
        docx.setData(data);
        docx.render();
        const blob = docx.getZip().generate({
          type: 'blob',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        return { blob, fileName: `${this.slug(input.title)}-${data.letter_date}.docx` };
      })
    );
  }

  private buildTemplateData(company: Company, input: { title: string; message: string; client: any; signedBy?: string; signature?: LetterSignature | null }): LetterData {
    const c = input.client || {};
    const ca = c.address || {};
    const a = company.address || {};
    return {
      letter_title: input.title,
      letter_date: new Date().toISOString().slice(0, 10),
      letter_message: input.message,
      client_name: c.displayName || '',
      client_street: `${ca.line1 || ''} ${ca.line2 || ''}`.trim(),
      client_suburb: ca.suburb || '',
      client_city: ca.city || '',
      client_province: ca.province || '',
      client_postal_code: ca.postalCode || '',
      client_contact_no: c.phone || '',
      client_email: c.email || '',
      company_name: company.name || '',
      company_reg_no: company.regNo || '',
      company_tel: company.tel || '',
      company_email: company.email || '',
      company_street: `${a.line1 || ''} ${a.line2 || ''}`.trim(),
      company_suburb: a.suburb || '',
      company_city: a.city || '',
      company_province: a.province || '',
      company_postal_code: a.postalCode || '',
      signed_by: input.signedBy || input.signature?.name || '',
      signature_url: input.signature?.url || ''
    };
  }

  private assertDocx(file: File) {
    if (!file) throw new Error('Letter template file is required.');
    if (!file.name.toLowerCase().endsWith('.docx')) throw new Error('Letter template must be a .docx file.');
  }

  private slug(value: string): string {
    return (value || 'letter').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'letter';
  }
}
