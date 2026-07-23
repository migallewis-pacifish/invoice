import { inject, Injectable } from '@angular/core';
import { collection, collectionData, doc, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { getBlob, ref, Storage, uploadBytes } from '@angular/fire/storage';
import { firstValueFrom, map, Observable, take } from 'rxjs';
import {
  CompanyEmailTemplate,
  CompanyEmailTemplateType,
  DEFAULT_COMPANY_EMAIL_TEMPLATES,
  EMAIL_TEMPLATE_VARIABLES,
  EmailTemplateVariables
} from '../models/company-email-template.model';

const HANDLEBARS_TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
const FREEMARKER_TOKEN_PATTERN = /\$\{\s*([a-zA-Z0-9_]+)\s*}/g;

@Injectable({ providedIn: 'root' })
export class EmailTemplateService {
  private readonly db = inject(Firestore);
  private readonly storage = inject(Storage);

  list(companyId: string): Observable<CompanyEmailTemplate[]> {
    return collectionData(collection(this.db, this.collectionPath(companyId)), { idField: 'id' }).pipe(
      map(templates => this.mergeDefaults(companyId, templates as CompanyEmailTemplate[]))
    );
  }

  async getTemplate(companyId: string, type: CompanyEmailTemplateType): Promise<CompanyEmailTemplate> {
    const templates = await firstValueFrom(this.list(companyId).pipe(take(1)));
    const template = templates.find(item => item.type === type) ?? this.defaultTemplate(companyId, type);
    return this.withBodyFromStorage(template);
  }

  async save(companyId: string, template: CompanyEmailTemplate): Promise<void> {
    const body = template.body ?? '';
    const errors = validateEmailTemplate(template.subject, body);
    if (errors.length) throw new Error(errors.join(' '));
    const id = template.id;
    const bodyStoragePath = this.storagePath(companyId, id);
    const variables = extractEmailTemplateVariables(`${template.subject}\n${body}`);
    await uploadBytes(ref(this.storage, bodyStoragePath), new Blob([toFreemarkerTemplate(body)], { type: 'text/x-freemarker' }), {
      contentType: 'text/x-freemarker',
      customMetadata: { templateType: template.type }
    });
    const { body: _body, ...metadata } = template;
    await setDoc(doc(this.db, `${this.collectionPath(companyId)}/${id}`), {
      ...metadata,
      companyId,
      bodyStoragePath,
      variables,
      updatedAt: serverTimestamp(),
      createdAt: template.createdAt ?? serverTimestamp()
    }, { merge: true });
  }

  async ensureDefaults(companyId: string): Promise<void> {
    await Promise.all(DEFAULT_COMPANY_EMAIL_TEMPLATES.map(template =>
      setDoc(doc(this.db, `${this.collectionPath(companyId)}/${template.id}`), {
        id: template.id,
        type: template.type,
        name: template.name,
        description: template.description,
        subject: template.subject,
        companyId,
        bodyStoragePath: this.storagePath(companyId, template.id),
        variables: extractEmailTemplateVariables(`${template.subject}\n${template.body}`),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true })
    ));
  }

  render(template: Pick<CompanyEmailTemplate, 'subject' | 'body'>, variables: EmailTemplateVariables): { subject: string; body: string; errors: string[] } {
    const subject = renderTemplateText(template.subject, variables);
    const body = renderTemplateText(template.body ?? '', variables);
    return { subject, body, errors: validateRenderedEmail(subject, body) };
  }

  private collectionPath(companyId: string): string { return `companies/${companyId}/emailTemplates`; }
  private storagePath(companyId: string, id: string): string { return `companies/${companyId}/email-templates/${id}.ftl`; }

  private mergeDefaults(companyId: string, stored: CompanyEmailTemplate[]): CompanyEmailTemplate[] {
    return DEFAULT_COMPANY_EMAIL_TEMPLATES.map(defaultTemplate => ({
      ...this.defaultTemplate(companyId, defaultTemplate.type),
      ...stored.find(template => template.id === defaultTemplate.id)
    }));
  }

  private defaultTemplate(companyId: string, type: CompanyEmailTemplateType): CompanyEmailTemplate {
    const template = DEFAULT_COMPANY_EMAIL_TEMPLATES.find(item => item.type === type) ?? DEFAULT_COMPANY_EMAIL_TEMPLATES[0];
    return { ...template, companyId, bodyStoragePath: this.storagePath(companyId, template.id), variables: extractEmailTemplateVariables(`${template.subject}\n${template.body}`) };
  }

  private async withBodyFromStorage(template: CompanyEmailTemplate): Promise<CompanyEmailTemplate> {
    if (!template.bodyStoragePath) return template;
    try {
      const blob = await getBlob(ref(this.storage, template.bodyStoragePath));
      return { ...template, body: fromFreemarkerTemplate(await blob.text()) };
    } catch {
      return template;
    }
  }
}

export function renderTemplateText(text: string, variables: EmailTemplateVariables): string {
  return text
    .replace(HANDLEBARS_TOKEN_PATTERN, (_, key: keyof EmailTemplateVariables) => variables[key] ?? '')
    .replace(FREEMARKER_TOKEN_PATTERN, (_, key: keyof EmailTemplateVariables) => variables[key] ?? '');
}

export function toFreemarkerTemplate(text: string): string { return text.replace(HANDLEBARS_TOKEN_PATTERN, (_, key) => '${' + key + '}'); }
export function fromFreemarkerTemplate(text: string): string { return text.replace(FREEMARKER_TOKEN_PATTERN, (_, key) => '{{' + key + '}}'); }
export function extractEmailTemplateVariables(text: string): (keyof EmailTemplateVariables)[] {
  const names = [...text.matchAll(HANDLEBARS_TOKEN_PATTERN), ...text.matchAll(FREEMARKER_TOKEN_PATTERN)].map(match => match[1] as keyof EmailTemplateVariables);
  return Array.from(new Set(names.filter(name => EMAIL_TEMPLATE_VARIABLES.includes(name))));
}

export function validateEmailTemplate(subject: string, body: string): string[] {
  const errors: string[] = [];
  if (!subject.trim()) errors.push('Template subject is required.');
  if (!body.trim()) errors.push('Template body is required.');
  for (const token of [...subject.matchAll(HANDLEBARS_TOKEN_PATTERN), ...body.matchAll(HANDLEBARS_TOKEN_PATTERN), ...subject.matchAll(FREEMARKER_TOKEN_PATTERN), ...body.matchAll(FREEMARKER_TOKEN_PATTERN)].map(match => match[1])) {
    if (!EMAIL_TEMPLATE_VARIABLES.includes(token as keyof EmailTemplateVariables)) errors.push(`Unknown template variable: ${token}.`);
  }
  return Array.from(new Set(errors));
}

export function validateRenderedEmail(subject: string, body: string): string[] {
  const errors: string[] = [];
  if (!subject.trim()) errors.push('Rendered email subject is empty.');
  if (!body.trim()) errors.push('Rendered email body is empty.');
  if (HANDLEBARS_TOKEN_PATTERN.test(subject) || HANDLEBARS_TOKEN_PATTERN.test(body) || FREEMARKER_TOKEN_PATTERN.test(subject) || FREEMARKER_TOKEN_PATTERN.test(body)) errors.push('Rendered email still contains unresolved template variables.');
  return errors;
}
