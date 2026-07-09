import { inject, Injectable } from '@angular/core';
import { Storage, ref, uploadBytes, getDownloadURL, getBlob, deleteObject } from '@angular/fire/storage';
import { Firestore, collection, collectionData, deleteDoc, doc, getDocs, setDoc, updateDoc } from '@angular/fire/firestore';
import { firstValueFrom, map, Observable } from 'rxjs';
import { CompanyTemplate } from '../models/invoice.model';
import { ActivityService } from './activity.service';

export type CompanyTemplateType = CompanyTemplate['type'];

export function selectDefaultTemplate(templates: CompanyTemplate[], type: CompanyTemplateType, configuredTemplateId?: string | null): CompanyTemplate | null {
  const candidates = templates.filter(template => template.type === type && !template.archived && !!template.storagePath);
  return candidates.find(template => template.id === configuredTemplateId)
    ?? candidates.find(template => template.isDefault)
    ?? candidates[0]
    ?? null;
}

@Injectable({
  providedIn: 'root'
})
export class TemplateService {
  private storage = inject(Storage);
  private db = inject(Firestore);
  private activityService = inject(ActivityService);

  async upload(companyId: string, file: File, type: CompanyTemplateType = 'invoice', templateId = this.newTemplateId(type)) {
    this.assertDocx(file);

    const path = `companies/${companyId}/templates/${templateId}.docx`;
    const r = ref(this.storage, path);
    await uploadBytes(r, file, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    const url = await getDownloadURL(r);
    const now = Date.now();
    const shouldDefault = await this.shouldBecomeDefault(companyId, type);
    const template: CompanyTemplate = {
      id: templateId,
      companyId,
      type,
      name: shouldDefault ? this.defaultName(type) : this.nameFromFile(file.name, type),
      storagePath: path,
      fileName: file.name,
      isDefault: shouldDefault,
      archived: false,
      updatedAt: now,
      createdAt: now
    };

    await this.activityService.track(
      companyId,
      'update',
      `companies/${companyId}/templates/${templateId}`,
      `Uploaded ${type} template.`,
      async () => {
        await setDoc(doc(this.db, `companies/${companyId}/templates/${templateId}`), template, { merge: true });
        if (shouldDefault) await this.setDefaultTemplate(companyId, templateId, type);
      }
    );
    return { path, url, template };
  }

  getDefaultTemplate(companyId: string, type: CompanyTemplateType): Observable<CompanyTemplate | null> {
    return collectionData(collection(this.db, `companies/${companyId}/templates`), { idField: 'id' }).pipe(
      map((templates: any[]) => selectDefaultTemplate(templates as CompanyTemplate[], type))
    );
  }

  async setDefaultTemplate(companyId: string, templateId: string, type: CompanyTemplateType): Promise<void> {
    const settingField = type === 'invoice' ? 'invoiceTemplateId' : 'letterTemplateId';
    await setDoc(doc(this.db, `companies/${companyId}/settings/templates`), {
      companyId,
      [settingField]: templateId,
      updatedAt: Date.now()
    }, { merge: true });
    const templates = await getDocs(collection(this.db, `companies/${companyId}/templates`));
    await Promise.all(templates.docs.map(snapshot => {
      const template = snapshot.data() as CompanyTemplate;
      if (template.type !== type) return Promise.resolve();
      return updateDoc(doc(this.db, `companies/${companyId}/templates/${snapshot.id}`), {
        isDefault: snapshot.id === templateId,
        archived: snapshot.id === templateId ? false : !!template.archived,
        updatedAt: Date.now()
      });
    }));
  }

  async archiveTemplate(companyId: string, templateId: string, archived: boolean): Promise<void> {
    await updateDoc(doc(this.db, `companies/${companyId}/templates/${templateId}`), { archived, updatedAt: Date.now() });
  }

  async renameTemplate(companyId: string, templateId: string, name: string): Promise<void> {
    const clean = name?.trim();
    if (!clean) throw new Error('Template name is required.');
    await updateDoc(doc(this.db, `companies/${companyId}/templates/${templateId}`), { name: clean, updatedAt: Date.now() });
  }

  async deleteTemplate(companyId: string, template: CompanyTemplate): Promise<void> {
    if (template.storagePath) {
      await deleteObject(ref(this.storage, template.storagePath)).catch(() => undefined);
    }
    await deleteDoc(doc(this.db, `companies/${companyId}/templates/${template.id}`));
  }

  async duplicateTemplate(companyId: string, template: CompanyTemplate): Promise<CompanyTemplate> {
    if (!template.storagePath) throw new Error('Template path is required.');
    const copyId = this.newTemplateId(template.type);
    const copyPath = `companies/${companyId}/templates/${copyId}.docx`;
    const source = ref(this.storage, template.storagePath);
    const target = ref(this.storage, copyPath);
    const blob = await getBlob(source);
    await uploadBytes(target, blob, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const now = Date.now();
    const copy: CompanyTemplate = {
      ...template,
      id: copyId,
      companyId,
      name: `${template.name || this.defaultName(template.type)} Copy`,
      storagePath: copyPath,
      isDefault: false,
      archived: false,
      createdAt: now,
      updatedAt: now
    };
    await setDoc(doc(this.db, `companies/${companyId}/templates/${copyId}`), copy);
    return copy;
  }

  async getDownloadUrl(path: string) {
    if (!path) throw new Error('Template path is required.');
    return getDownloadURL(ref(this.storage, path));
  }

  private async shouldBecomeDefault(companyId: string, type: CompanyTemplateType): Promise<boolean> {
    const template = await firstValueFrom(this.getDefaultTemplate(companyId, type));
    return !template;
  }

  private assertDocx(file: File) {
    if (!file) throw new Error('Template file is required.');
    if (!file.name.toLowerCase().endsWith('.docx')) throw new Error('Template must be a .docx file.');
  }

  private newTemplateId(type: CompanyTemplateType) {
    return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private defaultName(type: CompanyTemplateType) {
    return type === 'invoice' ? 'Default invoice template' : 'Default letter template';
  }

  private nameFromFile(fileName: string, type: CompanyTemplateType) {
    return fileName?.replace(/\.docx$/i, '') || this.defaultName(type);
  }
}
