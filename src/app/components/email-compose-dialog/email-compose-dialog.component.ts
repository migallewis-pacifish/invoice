import { CommonModule } from '@angular/common';
import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { EmailService, SendEmailRequest, normalizeEmailList, validateSendEmailRequest } from '../../services/email.service';

@Component({
  selector: 'app-email-compose-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './email-compose-dialog.component.html',
  styleUrl: './email-compose-dialog.component.scss'
})
export class EmailComposeDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly emailService = inject(EmailService);
  readonly sending = signal(false);
  readonly error = signal('');

  form: any;

  constructor(
    @Inject(DIALOG_DATA) public data: { request: SendEmailRequest; attachmentName?: string },
    private readonly dialogRef: DialogRef<boolean>
  ) {
    this.form = this.fb.nonNullable.group({
      recipient: [this.data.request.recipient, [Validators.required, Validators.email]],
      cc: [(this.data.request.cc || []).join(', ')],
      bcc: [(this.data.request.bcc || []).join(', ')],
      subject: [this.data.request.subject, [Validators.required]],
      messageBody: [this.data.request.messageBody, [Validators.required]],
    });
  }

  get attachmentLabel(): string {
    return this.data.attachmentName || this.data.request.attachment?.fileName || this.data.request.attachment?.storagePath || this.data.request.attachment?.generatedDocumentPayloadRef || 'Generated document';
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
    };
    const errors = validateSendEmailRequest(request);
    if (errors.length) {
      this.error.set(errors.join(' '));
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
}
