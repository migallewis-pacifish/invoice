import { CommonModule } from '@angular/common';
import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { getBlob, ref, Storage } from '@angular/fire/storage';
import { Observable, of } from 'rxjs';
import { EmailService, SendEmailRequest, normalizeEmailList, validateSendEmailRequest } from '../../services/email.service';
import { FormFieldComponent } from '../form-field/form-field.component';
import { EmailTemplateDefinition } from '../../models/email-template-designer.model';
import { EmailTemplateDefinitionService, renderDesignedEmailPreview } from '../../features/email-template-designer/services/email-template-definition.service';

@Component({
  selector: 'app-email-compose-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormFieldComponent],
  templateUrl: './email-compose-dialog.component.html',
  styleUrl: './email-compose-dialog.component.scss'
})
export class EmailComposeDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly emailService = inject(EmailService);
  private readonly designedTemplateService = inject(EmailTemplateDefinitionService);
  private readonly storage = inject(Storage);
  readonly sending = signal(false);
  readonly error = signal('');
  readonly previewHtml = signal('');
  readonly previewText = signal('');
  readonly previewUnresolved = signal<string[]>([]);
  readonly designedTemplates$: Observable<EmailTemplateDefinition[]>;

  form: any;
  private designedTemplates: EmailTemplateDefinition[] = [];

  constructor(
    @Inject(DIALOG_DATA) public data: { request: SendEmailRequest; attachmentName?: string },
    private readonly dialogRef: DialogRef<boolean>
  ) {
    const useCase = this.designedTemplateService.useCaseFor(this.data.request.documentType, this.data.request.reminderType);
    this.designedTemplates$ = this.data.request.companyId ? this.designedTemplateService.listSelectable(this.data.request.companyId, useCase) : of([]);
    this.designedTemplates$.subscribe(templates => this.designedTemplates = templates);
    this.form = this.fb.nonNullable.group({
      templateKind: [this.data.request.templateSelection?.kind || 'simple'],
      designedTemplateId: [this.data.request.templateSelection?.templateId || ''],
      recipient: [this.data.request.recipient, [Validators.required, Validators.email]],
      cc: [(this.data.request.cc || []).join(', ')],
      bcc: [(this.data.request.bcc || []).join(', ')],
      subject: [this.data.request.subject, [Validators.required]],
      messageBody: [this.data.request.messageBody],
    });
    this.form.valueChanges.subscribe(() => this.updatePreview());
    this.updatePreview();
  }

  get attachmentLabel(): string {
    return this.data.attachmentName || this.data.request.attachment?.fileName || this.data.request.attachment?.storagePath || this.data.request.attachment?.generatedDocumentPayloadRef || 'Generated document';
  }

  async updatePreview(): Promise<void> {
    const value = this.form.getRawValue();
    this.previewUnresolved.set([]);
    if (value.templateKind === 'designed' && value.designedTemplateId) {
      const template = this.designedTemplates.find(item => item.id === value.designedTemplateId);
      if (!template?.freemarkerStoragePath) return;
      const blob = await getBlob(ref(this.storage, template.freemarkerStoragePath));
      const rendered = renderDesignedEmailPreview(await blob.text(), (this.data.request.templateVariables || {}) as Record<string, unknown>);
      this.previewHtml.set(rendered.html);
      this.previewText.set(this.htmlToText(rendered.html));
      this.previewUnresolved.set(rendered.unresolved);
    } else {
      this.previewHtml.set('');
      this.previewText.set(value.messageBody || '');
    }
  }

  send(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request: SendEmailRequest = {
      ...this.data.request,
      recipient: value.recipient.trim(),
      cc: normalizeEmailList(value.cc),
      bcc: normalizeEmailList(value.bcc),
      subject: value.subject.trim(),
      messageBody: value.messageBody.trim(),
      templateSelection: value.templateKind === 'designed'
        ? { kind: 'designed', templateId: value.designedTemplateId }
        : { kind: 'simple' },
    };
    const errors = validateSendEmailRequest(request);
    if (errors.length || this.previewUnresolved().length) {
      this.error.set([...errors, ...this.previewUnresolved().map(key => `Template variable ${key} is unresolved.`)].join(' '));
      return;
    }
    this.sending.set(true);
    this.error.set('');
    this.emailService.send(request).subscribe({
      next: () => this.dialogRef.close(true),
      error: err => {
        this.error.set(err?.message || 'Email could not be sent.');
        this.sending.set(false);
      }
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  private htmlToText(html: string): string {
    return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
