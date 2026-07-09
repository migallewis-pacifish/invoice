import { inject, Injectable } from '@angular/core';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';
import { CompanyTemplate } from '../models/invoice.model';
import { ActivityService } from './activity.service';

export type CompanyTemplateType = CompanyTemplate['type'];

@Injectable({
  providedIn: 'root'
})
export class TemplateService {
  private storage = inject(Storage);
  private db = inject(Firestore);
  private activityService = inject(ActivityService);

  async upload(companyId: string, file: File, type: CompanyTemplateType = 'invoice') {
    this.assertDocx(file);

    const templateId = type;
    const path = `companies/${companyId}/templates/${templateId}.docx`;
    const r = ref(this.storage, path);
    await uploadBytes(r, file, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    const url = await getDownloadURL(r);
    const now = Date.now();
    const template: CompanyTemplate = {
      id: templateId,
      companyId,
      type,
      name: this.defaultName(type),
      storagePath: path,
      fileName: file.name,
      isDefault: true,
      updatedAt: now,
      createdAt: now
    };

    await this.activityService.track(
      companyId,
      'update',
      `companies/${companyId}/templates/${templateId}`,
      `Updated ${type} template.`,
      () => setDoc(doc(this.db, `companies/${companyId}/templates/${templateId}`), template, { merge: true })
    );
    return { path, url, template };
  }

  getDefaultTemplate(companyId: string, type: CompanyTemplateType): Observable<CompanyTemplate | null> {
    return docData(doc(this.db, `companies/${companyId}/templates/${type}`)).pipe(
      map((template: any) => template?.storagePath ? template as CompanyTemplate : null)
    );
  }

  async getDownloadUrl(path: string) {
    if (!path) {
      throw new Error('Template path is required.');
    }

    return getDownloadURL(ref(this.storage, path));
  }

  private assertDocx(file: File) {
    if (!file) {
      throw new Error('Template file is required.');
    }
    if (!file.name.toLowerCase().endsWith('.docx')) {
      throw new Error('Template must be a .docx file.');
    }
  }

  private defaultName(type: CompanyTemplateType) {
    return type === 'invoice' ? 'Default invoice template' : 'Default letter template';
  }
}
