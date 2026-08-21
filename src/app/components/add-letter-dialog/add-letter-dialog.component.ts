import { DIALOG_DATA, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { collection, collectionData, doc, docData, Firestore } from '@angular/fire/firestore';
import { catchError, finalize, from, map, Observable, of, switchMap, take, tap } from 'rxjs';
import { CompanyTemplate } from '../../models/invoice.model';
import { LetterSignature } from '../../models/letter.model';
import { ClientService } from '../../services/client.service';
import { LetterDocxService } from '../../services/letter-docx.service';
import { DocumentTemplatePreviewService } from '../../services/document-template-preview.service';
import { TemplateService } from '../../services/template.service';
import { normalizeTemplateFormat } from '../../services/template-renderer.service';
import { DialogShellComponent } from '../dialog-shell/dialog-shell.component';
import { TemplatePreviewFrameComponent } from '../template-preview-frame/template-preview-frame.component';

@Component({ selector: 'app-add-letter-dialog', standalone: true, imports: [CommonModule, ReactiveFormsModule, DialogModule, DialogShellComponent, TemplatePreviewFrameComponent], templateUrl: './add-letter-dialog.component.html', styleUrl: './add-letter-dialog.component.scss' })
export class AddLetterDialogComponent {
  @ViewChild('messageEditor') private messageEditor?: ElementRef<HTMLElement>;
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(DialogRef<string | null>);
  private readonly data = inject(DIALOG_DATA);
  private readonly letterDocx = inject(LetterDocxService);
  private readonly clientSvc = inject(ClientService);
  private readonly db = inject(Firestore);
  private readonly templateService = inject(TemplateService);
  private readonly documentPreview = inject(DocumentTemplatePreviewService);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly letterTemplates = signal<CompanyTemplate[]>([]);
  readonly templatesLoading = signal(true);
  readonly defaultSignature = signal<LetterSignature | null>(null);
  readonly previewHtml = signal<string | null>(null);
  readonly previewBusy = signal(false);
  readonly company = signal<any>(null);
  readonly client = this.data?.client;
  readonly clientId = this.data?.clientId;
  readonly companyId = typeof this.data?.companyId === 'function' ? this.data?.companyId() : this.data?.companyId;
  readonly form = this.fb.group({ title: ['', Validators.required], message: ['', Validators.required], templateId: ['', Validators.required], includeSignature: ['no', Validators.required] });

  constructor() { this.loadCompanyLetterSettings(); }

  close(): void { this.dialog.close(null); }

  templateFormatLabel(template: CompanyTemplate): string {
    return normalizeTemplateFormat(template) === 'docx' ? 'Microsoft Word' : 'PDF';
  }

  formatMessage(command: 'bold' | 'italic' | 'underline'): void {
    this.messageEditor?.nativeElement.focus();
    document.execCommand(command, false);
    this.syncMessage();
  }

  changeCase(mode: 'upper' | 'lower'): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !this.messageEditor?.nativeElement.contains(selection.anchorNode)) return;
    const range = selection.getRangeAt(0);
    const text = range.toString();
    range.deleteContents();
    const replacement = document.createTextNode(mode === 'upper' ? text.toUpperCase() : text.toLowerCase());
    range.insertNode(replacement);
    range.selectNodeContents(replacement);
    selection.removeAllRanges();
    selection.addRange(range);
    this.syncMessage();
  }

  setFontColour(event: Event): void {
    this.messageEditor?.nativeElement.focus();
    document.execCommand('foreColor', false, (event.target as HTMLInputElement).value);
    this.syncMessage();
  }

  syncMessage(): void {
    const editor = this.messageEditor?.nativeElement;
    if (!editor) return;
    const html = this.sanitizeMessage(editor.innerHTML);
    this.form.controls.message.setValue(editor.innerText.trim() ? html : '');
  }

  async previewLetter(): Promise<void> {
    this.syncMessage();
    const value = this.form.getRawValue();
    const template = this.letterTemplates().find(candidate => candidate.id === value.templateId);
    if (!template) { this.error.set('Select a letter template to preview.'); return; }
    if (normalizeTemplateFormat(template) !== 'freemarker-html') {
      this.error.set('Preview is available for ready-made PDF templates. Word templates are previewed after generation.');
      return;
    }
    const path = template.bodyStoragePath || template.storagePath;
    if (!path) return;
    this.previewBusy.set(true);
    this.error.set(null);
    try {
      const source = await this.templateService.getTemplateSource(path);
      const address = this.client?.address || {};
      const company = this.company() || {};
      const companyAddress = company.address || {};
      const signature = value.includeSignature === 'yes' ? this.defaultSignature() : null;
      this.previewHtml.set(this.documentPreview.buildHtml(source, {
        'letter.title': value.title || 'Untitled letter', 'letter.message': this.sanitizeMessage(value.message || ''),
        'letter.date': new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }),
        'letter.signedBy': signature?.name || '', 'letter.signatureUrl': signature?.url || '',
        'company.name': company.name || '', 'company.email': company.email || '', 'company.phone': company.phone || company.tel || '',
        'company.website': company.website || '', 'company.logoUrl': company.logoUrl || '',
        'company.address': typeof companyAddress === 'string' ? companyAddress : [companyAddress.line1, companyAddress.line2, companyAddress.suburb, companyAddress.city, companyAddress.postalCode].filter(Boolean).join(', '),
        'client.name': this.client?.displayName || this.client?.name || '', 'client.email': this.client?.email || '',
        'client.address.line1': address.line1 || '', 'client.address.suburb': address.suburb || '',
        'client.address.city': address.city || '', 'client.address.postalCode': address.postalCode || ''
      }));
    } catch (error: any) {
      this.error.set(error?.message || 'Unable to preview this letter.');
    } finally {
      this.previewBusy.set(false);
    }
  }

  generateLetter(): void {
    this.syncMessage();
    if (this.form.invalid || this.saving()) return;
    const value = this.form.getRawValue();
    const template = this.letterTemplates().find(candidate => candidate.id === value.templateId);
    if (!template) { this.error.set('Select a letter template.'); return; }

    this.saving.set(true);
    this.error.set(null);
    const signature = value.includeSignature === 'yes' ? this.defaultSignature() : null;
    const richMessage = this.sanitizeMessage(value.message || '');
    const isPdf = normalizeTemplateFormat(template) !== 'docx';
    const letterInput = {
      title: value.title || '', message: isPdf ? richMessage : this.messageEditor?.nativeElement.innerText || '',
      client: this.client, signedBy: signature?.name || '', signature
    };
    const generate$: Observable<{ filename: string; generatedFile: any }> = isPdf
      ? this.letterDocx.generatePdfViaBackend(this.companyId, letterInput, template.id).pipe(map(result => ({ filename: result.fileName, generatedFile: result })))
      : this.letterDocx.generateAndSave(this.companyId, letterInput, template.id).pipe(map(filename => ({ filename, generatedFile: null })));

    generate$.pipe(
      switchMap(generated => from(this.clientSvc.createLetter(this.clientId, {
        title: value.title, message: richMessage, signedBy: signature?.name || '', signatureId: signature?.id || null,
        signaturePath: signature?.path || null, templateId: template.id, filename: generated.filename,
        generatedFile: generated.generatedFile, downloadFormat: isPdf ? 'pdf' : 'docx', date: new Date().toISOString().slice(0, 10), createdAt: Date.now()
      })).pipe(map(() => generated))),
      tap(generated => this.dialog.close(generated.filename)),
      catchError(err => { console.error(err); this.error.set(err?.message || 'Failed to generate or save letter.'); return of(null); }),
      finalize(() => this.saving.set(false))
    ).subscribe();
  }

  private loadCompanyLetterSettings(): void {
    if (!this.companyId) { this.templatesLoading.set(false); return; }
    collectionData(collection(this.db, `companies/${this.companyId}/templates`), { idField: 'id' }).subscribe({
      next: records => {
        const templates = (records as CompanyTemplate[]).filter(template => template.type === 'letter' && !template.archived && !!(template.bodyStoragePath || template.storagePath))
          .sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault) || (a.name || '').localeCompare(b.name || ''));
        this.letterTemplates.set(templates);
        this.form.controls.templateId.setValue(templates.find(template => template.isDefault)?.id || templates[0]?.id || '');
        this.templatesLoading.set(false);
      },
      error: () => { this.templatesLoading.set(false); this.error.set('Unable to load letter templates.'); }
    });
    docData(doc(this.db, `companies/${this.companyId}`)).pipe(take(1)).subscribe((company: any) => {
      this.company.set(company);
      const stored = company?.signature;
      const url = stored?.imageUrl || stored?.url || company?.signatureUrl || '';
      if (!url) return;
      this.defaultSignature.set({ id: 'default', name: stored?.name || 'Authorised signature', path: stored?.path || company?.signaturePath || '', url, createdAt: stored?.updatedAt || 0 });
    });
  }

  private sanitizeMessage(html: string): string {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'DIV', 'P', 'BR']);
    Array.from(parsed.body.querySelectorAll('*')).forEach(element => {
      if (!allowed.has(element.tagName)) { element.replaceWith(...Array.from(element.childNodes)); return; }
      const colour = (element as HTMLElement).style.color;
      Array.from(element.attributes).forEach(attribute => element.removeAttribute(attribute.name));
      if (element.tagName === 'SPAN' && colour && /^(#[0-9a-f]{3,8}|rgb\([\d\s,.%]+\)|[a-z]+)$/i.test(colour)) (element as HTMLElement).style.color = colour;
    });
    return parsed.body.innerHTML.trim();
  }
}
