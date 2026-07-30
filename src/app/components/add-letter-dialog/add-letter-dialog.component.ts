import { DialogModule, DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { getDownloadURL, ref, Storage } from '@angular/fire/storage';
import { catchError, finalize, from, map, Observable, of, switchMap, take, tap } from 'rxjs';
import { ClientService } from '../../services/client.service';
import { LetterDocxService } from '../../services/letter-docx.service';
import { LetterSignature } from '../../models/letter.model';
import { DialogShellComponent } from '../dialog-shell/dialog-shell.component';

@Component({
  selector: 'app-add-letter-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule, DialogShellComponent],
  templateUrl: './add-letter-dialog.component.html',
  styleUrl: './add-letter-dialog.component.scss'
})
export class AddLetterDialogComponent {
  private fb = inject(FormBuilder);
  private dialog = inject(DialogRef<string | null>);
  private data = inject(DIALOG_DATA);
  private letterDocx = inject(LetterDocxService);
  private clientSvc = inject(ClientService);
  private db = inject(Firestore);
  private storage = inject(Storage);

  saving = signal(false);
  uploading = signal(false);
  error = signal<string | null>(null);
  info = signal<string | null>(null);
  templatePath = signal<string | null>(null);
  signatures = signal<LetterSignature[]>([]);

  client = this.data?.client;
  clientId = this.data?.clientId;
  companyId = typeof this.data?.companyId === 'function' ? this.data?.companyId() : this.data?.companyId;

  form = this.fb.group({
    title: ['', Validators.required],
    message: ['', Validators.required],
    signedBy: [''],
    signatureId: [''],
    downloadFormat: ['docx']
  });

  constructor() {
    this.loadCompanyLetterSettings();
  }

  close() { this.dialog.close(null); }

  async uploadTemplate(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file || !this.companyId) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      const result = await this.letterDocx.uploadTemplate(this.companyId, file);
      this.templatePath.set(result.path);
      this.info.set('Letter template uploaded. Use placeholders like {letter_title}, {letter_message}, {client_name}, {company_name}, {signed_by}, and {signature_url}.');
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to upload letter template.');
    } finally {
      this.uploading.set(false);
      (ev.target as HTMLInputElement).value = '';
    }
  }

  async uploadSignature(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    const signedBy = this.form.value.signedBy || '';
    if (!file || !this.companyId) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      const signature = await this.letterDocx.uploadSignature(this.companyId, signedBy, file);
      this.signatures.update(list => [...list, signature]);
      this.form.patchValue({ signatureId: signature.id, signedBy: signature.name });
      this.info.set(`Signature uploaded for ${signature.name}.`);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to upload signature.');
    } finally {
      this.uploading.set(false);
      (ev.target as HTMLInputElement).value = '';
    }
  }

  generateLetter() {
    if (this.form.invalid || this.saving()) return;
    if (!this.templatePath()) {
      this.error.set('Upload a letter Word template before generating letters.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();
    const signature = this.signatures().find(sig => sig.id === value.signatureId) || null;

    const letterInput = {
      title: value.title || '',
      message: value.message || '',
      client: this.client,
      signedBy: value.signedBy || signature?.name || '',
      signature
    };
    const generate$: Observable<{ filename: string; generatedFile: any }> = value.downloadFormat === 'pdf'
      ? this.letterDocx.generatePdfViaBackend(this.companyId, letterInput).pipe(map(result => ({ filename: result.fileName, generatedFile: result })))
      : this.letterDocx.generateAndSave(this.companyId, letterInput).pipe(map(filename => ({ filename, generatedFile: null as any }))); 

    generate$.pipe(
      switchMap(generated => from(this.clientSvc.createLetter(this.clientId, {
        title: value.title,
        message: value.message,
        signedBy: value.signedBy || signature?.name || '',
        signatureId: signature?.id || null,
        signaturePath: signature?.path || null,
        filename: generated.filename,
        generatedFile: generated.generatedFile,
        downloadFormat: value.downloadFormat || 'docx',
        date: new Date().toISOString().slice(0, 10),
        createdAt: Date.now()
      })).pipe(map(() => generated))),
      tap(generated => this.dialog.close(generated.filename)),
      catchError(err => {
        console.error(err);
        this.error.set(err?.message || 'Failed to generate or save letter.');
        return of(null);
      }),
      finalize(() => this.saving.set(false))
    ).subscribe();
  }

  private loadCompanyLetterSettings() {
    if (!this.companyId) return;
    docData(doc(this.db, `companies/${this.companyId}`)).pipe(take(1)).subscribe(async (company: any) => {
      docData(doc(this.db, `companies/${this.companyId}/templates/letter`)).pipe(take(1)).subscribe((template: any) => {
        this.templatePath.set(template?.storagePath || null);
      });
      const signatures = await Promise.all((company?.signatures || []).map(async (sig: LetterSignature) => ({
        ...sig,
        url: sig.url || await getDownloadURL(ref(this.storage, sig.path)).catch(() => '')
      })));
      this.signatures.set(signatures);
    });
  }
}
