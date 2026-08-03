import { inject, Injectable } from '@angular/core';
import { collection, collectionData, doc, docData, Firestore, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ref, Storage, uploadBytes } from '@angular/fire/storage';
import { map, Observable } from 'rxjs';
import { EmailTemplateDefinition, EmailTemplateScenario, EmailTemplateType } from '../../../models/email-template-designer.model';
import { EmailTemplateBuilderService } from './email-template-builder.service';

export type DesignedEmailTemplateUseCase = 'invoice' | 'reminder' | 'letter' | 'general';
export const EMAIL_TEMPLATE_SCENARIOS: { value: EmailTemplateScenario; label: string; type: EmailTemplateType }[] = [
  { value: 'invoice-sending', label: 'Invoice sending', type: 'invoice' },
  { value: 'before-due-reminder', label: 'Before-due reminder', type: 'payment-reminder' },
  { value: 'due-today-reminder', label: 'Due-today reminder', type: 'payment-reminder' },
  { value: 'overdue-reminder', label: 'Overdue reminder', type: 'payment-reminder' },
  { value: 'overdue-notice', label: 'Overdue notice', type: 'payment-reminder' },
  { value: 'letter-sending', label: 'Letter sending', type: 'letter' },
  { value: 'general-email', label: 'General email', type: 'general' }
];

const USE_CASE_TYPES: Record<DesignedEmailTemplateUseCase, EmailTemplateType[]> = {
  invoice: ['invoice'],
  reminder: ['payment-reminder'],
  letter: ['letter'],
  general: ['general']
};

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

  listSelectable(companyId: string, useCase: DesignedEmailTemplateUseCase): Observable<EmailTemplateDefinition[]> {
    return collectionData(query(collection(this.db, this.collectionPath(companyId)), where('type', 'in', USE_CASE_TYPES[useCase])), { idField: 'id' }).pipe(
      map(templates => (templates as EmailTemplateDefinition[]).filter(template => !!template.freemarkerStoragePath && !template.archived))
    );
  }

  useCaseFor(documentType: 'invoice' | 'letter', reminderType?: unknown): DesignedEmailTemplateUseCase {
    if (reminderType) return 'reminder';
    return documentType === 'letter' ? 'letter' : 'invoice';
  }

  async duplicate(companyId: string, template: EmailTemplateDefinition): Promise<string> {
    return this.save(companyId, { ...structuredClone(template), id: undefined, name: `${template.name} copy`, archived: false, defaultForScenarios: [], createdAt: undefined, updatedAt: undefined });
  }

  async rename(companyId: string, templateId: string, name: string): Promise<void> {
    await updateDoc(doc(this.db, `${this.collectionPath(companyId)}/${templateId}`), { name, updatedAt: serverTimestamp() });
  }

  async archive(companyId: string, templateId: string, archived: boolean): Promise<void> {
    await updateDoc(doc(this.db, `${this.collectionPath(companyId)}/${templateId}`), { archived, updatedAt: serverTimestamp(), ...(archived ? { defaultForScenarios: [] } : {}) });
  }

  async setDefaultForScenario(companyId: string, template: EmailTemplateDefinition, scenario: EmailTemplateScenario): Promise<void> {
    const batch = writeBatch(this.db);
    const snapshot = await getDocs(collection(this.db, this.collectionPath(companyId)));
    snapshot.docs.forEach(templateDoc => {
      const data = templateDoc.data() as EmailTemplateDefinition;
      batch.update(templateDoc.ref, { defaultForScenarios: removeDefaultScenario(data, scenario) });
    });
    batch.update(doc(this.db, `${this.collectionPath(companyId)}/${template.id}`), { defaultForScenarios: addDefaultScenario(template, scenario), scenario, archived: false, updatedAt: serverTimestamp() });
    await batch.commit();
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

export function renderDesignedEmailPreview(text: string, variables: Record<string, unknown>): { html: string; unresolved: string[] } {
  const unresolved = new Set<string>();
  const html = text.replace(/\$\{\s*([a-zA-Z0-9_.]+)\s*}/g, (_, key: string) => {
    const value = lookupTemplateValue(variables, key);
    if (value === undefined || value === null || value === '') {
      unresolved.add(key);
      return '${' + key + '}';
    }
    return String(value);
  });
  return { html, unresolved: Array.from(unresolved) };
}

function lookupTemplateValue(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined), source);
}

export function removeDefaultScenario(template: Pick<EmailTemplateDefinition, 'defaultForScenarios'>, scenario: EmailTemplateScenario): EmailTemplateScenario[] {
  return (template.defaultForScenarios ?? []).filter(value => value !== scenario);
}

export function addDefaultScenario(template: Pick<EmailTemplateDefinition, 'defaultForScenarios'>, scenario: EmailTemplateScenario): EmailTemplateScenario[] {
  return Array.from(new Set([...(template.defaultForScenarios ?? []), scenario]));
}
