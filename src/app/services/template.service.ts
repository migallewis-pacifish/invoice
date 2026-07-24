import { inject, Injectable } from '@angular/core';
import { Storage, ref, uploadBytes, getDownloadURL, getBlob, deleteObject } from '@angular/fire/storage';
import { Firestore, collection, collectionData, deleteDoc, doc, getDocs, setDoc, updateDoc } from '@angular/fire/firestore';
import { firstValueFrom, map, Observable } from 'rxjs';
import { CompanyTemplate, CompanyTemplateFormat } from '../models/invoice.model';
import { normalizeTemplateFormat } from './template-renderer.service';
import { ActivityService } from './activity.service';

export type CompanyTemplateType = CompanyTemplate['type'];

export interface TemplateUploadOptions {
  format?: CompanyTemplateFormat;
  name?: string;
  requiredVariables?: string[];
}

const FORMAT_CONFIG: Record<CompanyTemplateFormat, { ext: string; contentType: string; label: string }> = {
  docx: { ext: '.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word DOCX' },
  'freemarker-html': { ext: '.html', contentType: 'text/html', label: 'FreeMarker/HTML' },
  'pdf-mapped': { ext: '.pdf', contentType: 'application/pdf', label: 'PDF-mapped' }
};

export function selectDefaultTemplate(templates: CompanyTemplate[], type: CompanyTemplateType, configuredTemplateId?: string | null): CompanyTemplate | null {
  const candidates = templates.filter(template => template.type === type && !template.archived && !!(template.bodyStoragePath || template.storagePath));
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

  async upload(companyId: string, file: File, type: CompanyTemplateType = 'invoice', templateId = this.newTemplateId(type), options: TemplateUploadOptions = {}) {
    const format = options.format ?? 'docx';
    await this.validateTemplateFile(file, format, type);

    const config = FORMAT_CONFIG[format];
    const path = format === 'pdf-mapped'
      ? `companies/${companyId}/pdf-templates/${templateId}/source.pdf`
      : `companies/${companyId}/templates/${templateId}${config.ext}`;
    const r = ref(this.storage, path);
    await uploadBytes(r, file, { contentType: file.type || config.contentType });
    const url = await getDownloadURL(r);
    const now = Date.now();
    const shouldDefault = await this.shouldBecomeDefault(companyId, type);
    const template: CompanyTemplate = {
      id: templateId,
      companyId,
      type,
      name: options.name?.trim() || (shouldDefault ? this.defaultName(type) : this.nameFromFile(file.name, type, format)),
      format,
      bodyStoragePath: path,
      storagePath: path,
      fileName: file.name,
      requiredVariables: this.requiredVariablesFor(type, format),
      isDefault: shouldDefault,
      archived: false,
      updatedAt: now,
      createdAt: now
    };

    await this.activityService.track(
      companyId,
      'update',
      `companies/${companyId}/templates/${templateId}`,
      `Uploaded ${type} ${config.label} template.`,
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
    const paths = Array.from(new Set([template.bodyStoragePath, template.storagePath, template.preview?.storagePath, template.preview?.imageStoragePath, template.preview?.thumbnailStoragePath].filter(Boolean) as string[]));
    await Promise.all(paths.map(path => deleteObject(ref(this.storage, path)).catch(() => undefined)));
    await deleteDoc(doc(this.db, `companies/${companyId}/templates/${template.id}`));
  }

  async duplicateTemplate(companyId: string, template: CompanyTemplate): Promise<CompanyTemplate> {
    if (!(template.bodyStoragePath || template.storagePath)) throw new Error('Template path is required.');
    const copyId = this.newTemplateId(template.type);
    const format = normalizeTemplateFormat(template);
    const config = FORMAT_CONFIG[format];
    const sourcePath = template.bodyStoragePath || template.storagePath;
    const copyPath = format === 'pdf-mapped'
      ? `companies/${companyId}/pdf-templates/${copyId}/source.pdf`
      : `companies/${companyId}/templates/${copyId}${config.ext}`;
    const source = ref(this.storage, sourcePath);
    const target = ref(this.storage, copyPath);
    const blob = await getBlob(source);
    await uploadBytes(target, blob, { contentType: config.contentType });
    const now = Date.now();
    const copy: CompanyTemplate = {
      ...template,
      id: copyId,
      companyId,
      name: `${template.name || this.defaultName(template.type)} Copy`,
      format,
      bodyStoragePath: copyPath,
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

  private async validateTemplateFile(file: File, format: CompanyTemplateFormat, type: CompanyTemplateType): Promise<void> {
    if (!file) throw new Error('Template file is required.');
    const config = FORMAT_CONFIG[format];
    if (!file.name.toLowerCase().endsWith(config.ext)) throw new Error(`${config.label} templates must use ${config.ext} files.`);
    if (format === 'freemarker-html') {
      const body = await file.text();
      const missing = this.requiredVariablesFor(type, format).filter(variable => !body.includes(`{{${variable}}`) && !body.includes('${' + variable + '}'));
      if (missing.length) throw new Error(`Missing required ${type} variables: ${missing.join(', ')}.`);
    }
  }

  private newTemplateId(type: CompanyTemplateType) {
    return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private defaultName(type: CompanyTemplateType) {
    return type === 'invoice' ? 'Default invoice template' : 'Default letter template';
  }

  private nameFromFile(fileName: string, type: CompanyTemplateType, format: CompanyTemplateFormat) {
    return fileName?.replace(new RegExp(`${FORMAT_CONFIG[format].ext}$`, 'i'), '') || this.defaultName(type);
  }

  private requiredVariablesFor(type: CompanyTemplateType, format: CompanyTemplateFormat): string[] {
    if (format === 'pdf-mapped') return [];
    return type === 'invoice'
      ? ['invoice_number', 'invoice_date', 'client_name', 'items', 'total']
      : ['letter_title', 'letter_date', 'letter_message', 'client_name', 'company_name'];
  }
}
