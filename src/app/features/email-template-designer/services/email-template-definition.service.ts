import { inject, Injectable } from '@angular/core';
import { collection, collectionData, doc, docData, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { ref, Storage, uploadBytes } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { EmailTemplateDefinition } from '../../../models/email-template-designer.model';
import { EmailTemplateBuilderService } from './email-template-builder.service';

@Injectable({ providedIn: 'root' })
export class EmailTemplateDefinitionService {
  private readonly db = inject(Firestore);
  private readonly storage = inject(Storage);
  private readonly builder = inject(EmailTemplateBuilderService);

  list(companyId: string): Observable<EmailTemplateDefinition[]> {
    return collectionData(collection(this.db, this.collectionPath(companyId)), { idField: 'id' }) as Observable<EmailTemplateDefinition[]>;
  }

  get(companyId: string, templateId: string): Observable<EmailTemplateDefinition | undefined> {
    return docData(doc(this.db, `${this.collectionPath(companyId)}/${templateId}`), { idField: 'id' }) as Observable<EmailTemplateDefinition | undefined>;
  }

  async save(companyId: string, template: EmailTemplateDefinition): Promise<string> {
    const id = template.id ?? crypto.randomUUID();
    const freemarkerStoragePath = `companies/${companyId}/email-design-templates/${id}.ftl`;
    const freemarkerHtml = toFreemarkerTemplate(this.builder.buildHtml(template));
    const variables = extractDesignerTemplateVariables(freemarkerHtml);
    await uploadBytes(ref(this.storage, freemarkerStoragePath), new Blob([freemarkerHtml], { type: 'text/x-freemarker' }), {
      contentType: 'text/x-freemarker',
      customMetadata: { templateType: template.type }
    });
    await setDoc(doc(this.db, `${this.collectionPath(companyId)}/${id}`), {
      ...template,
      id,
      companyId,
      freemarkerStoragePath,
      variables,
      updatedAt: serverTimestamp(),
      createdAt: template.createdAt ?? serverTimestamp()
    }, { merge: true });
    return id;
  }

  private collectionPath(companyId: string): string {
    return `companies/${companyId}/emailDesignTemplates`;
  }
}


export function toFreemarkerTemplate(text: string): string {
  return text.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_, key) => '${' + key + '}');
}

export function extractDesignerTemplateVariables(text: string): string[] {
  return Array.from(new Set([...text.matchAll(/\$\{\s*([a-zA-Z0-9_.]+)\s*}/g)].map(match => match[1])));
}
