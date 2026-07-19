import { inject, Injectable } from '@angular/core';
import { collection, collectionData, doc, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { firstValueFrom, map, Observable, take } from 'rxjs';
import {
  CompanyEmailTemplate,
  CompanyEmailTemplateType,
  DEFAULT_COMPANY_EMAIL_TEMPLATES,
  EMAIL_TEMPLATE_VARIABLES,
  EmailTemplateVariables
} from '../models/company-email-template.model';

const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

@Injectable({ providedIn: 'root' })
export class EmailTemplateService {
  private readonly db = inject(Firestore);

  list(companyId: string): Observable<CompanyEmailTemplate[]> {
    return collectionData(collection(this.db, this.collectionPath(companyId)), { idField: 'id' }).pipe(
      map(templates => this.mergeDefaults(companyId, templates as CompanyEmailTemplate[]))
    );
  }

  async getTemplate(companyId: string, type: CompanyEmailTemplateType): Promise<CompanyEmailTemplate> {
    const templates = await firstValueFrom(this.list(companyId).pipe(take(1)));
    return templates.find(template => template.type === type) ?? this.defaultTemplate(companyId, type);
  }

  async save(companyId: string, template: CompanyEmailTemplate): Promise<void> {
    const errors = validateEmailTemplate(template.subject, template.body);
    if (errors.length) throw new Error(errors.join(' '));
    await setDoc(doc(this.db, `${this.collectionPath(companyId)}/${template.id}`), {
      ...template,
      companyId,
      updatedAt: serverTimestamp(),
      createdAt: template.createdAt ?? serverTimestamp()
    }, { merge: true });
  }

  async ensureDefaults(companyId: string): Promise<void> {
    await Promise.all(DEFAULT_COMPANY_EMAIL_TEMPLATES.map(template =>
      setDoc(doc(this.db, `${this.collectionPath(companyId)}/${template.id}`), {
        ...template,
        companyId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true })
    ));
  }

  render(template: Pick<CompanyEmailTemplate, 'subject' | 'body'>, variables: EmailTemplateVariables): { subject: string; body: string; errors: string[] } {
    const subject = renderTemplateText(template.subject, variables);
    const body = renderTemplateText(template.body, variables);
    return { subject, body, errors: validateRenderedEmail(subject, body) };
  }

  private collectionPath(companyId: string): string {
    return `companies/${companyId}/emailTemplates`;
  }

  private mergeDefaults(companyId: string, stored: CompanyEmailTemplate[]): CompanyEmailTemplate[] {
    return DEFAULT_COMPANY_EMAIL_TEMPLATES.map(defaultTemplate => ({
      ...this.defaultTemplate(companyId, defaultTemplate.type),
      ...stored.find(template => template.id === defaultTemplate.id)
    }));
  }

  private defaultTemplate(companyId: string, type: CompanyEmailTemplateType): CompanyEmailTemplate {
    const template = DEFAULT_COMPANY_EMAIL_TEMPLATES.find(item => item.type === type) ?? DEFAULT_COMPANY_EMAIL_TEMPLATES[0];
    return { ...template, companyId };
  }
}

export function renderTemplateText(text: string, variables: EmailTemplateVariables): string {
  return text.replace(TOKEN_PATTERN, (_, key: keyof EmailTemplateVariables) => variables[key] ?? '');
}

export function validateEmailTemplate(subject: string, body: string): string[] {
  const errors: string[] = [];
  if (!subject.trim()) errors.push('Template subject is required.');
  if (!body.trim()) errors.push('Template body is required.');
  for (const token of [...subject.matchAll(TOKEN_PATTERN), ...body.matchAll(TOKEN_PATTERN)].map(match => match[1])) {
    if (!EMAIL_TEMPLATE_VARIABLES.includes(token as keyof EmailTemplateVariables)) errors.push(`Unknown template variable: ${token}.`);
  }
  return Array.from(new Set(errors));
}

export function validateRenderedEmail(subject: string, body: string): string[] {
  const errors: string[] = [];
  if (!subject.trim()) errors.push('Rendered email subject is empty.');
  if (!body.trim()) errors.push('Rendered email body is empty.');
  if (/{{\s*([a-zA-Z0-9_]+)\s*}}/.test(subject) || /{{\s*([a-zA-Z0-9_]+)\s*}}/.test(body)) errors.push('Rendered email still contains unresolved template variables.');
  return errors;
}
