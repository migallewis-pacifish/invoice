import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { collection, collectionData, doc, docData, Firestore } from '@angular/fire/firestore';
import { getDownloadURL, ref, Storage } from '@angular/fire/storage';
import { take } from 'rxjs';
import { RouterLink } from '@angular/router';
import { ActivityService } from '../../services/activity.service';
import { TemplateService } from '../../services/template.service';
import { CompanyTemplate, CompanyTemplateFormat, PdfTemplateMapping } from '../../models/invoice.model';
import { PdfTemplateService } from '../../services/pdf-template.service';
import { requiredVariablesForTemplate, variableLabel } from '../../models/template-variable-registry.model';
import { CURRENT_AUTH_USER } from '../../services/company-context.service';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

@Component({
  selector: 'app-upload-template',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './upload-template.component.html',
  styleUrl: './upload-template.component.scss'
})
export class UploadTemplateComponent {
  @Input() inDialog = false;                         // hide page-only bits when in a dialog
  @Input() set fixedFormat(value: CompanyTemplateFormat | null | undefined) {
    this.lockedFormat.set(value ?? null);
    if (value) this.format.set(value);
  }
  @Input() set existingTemplate(value: CompanyTemplate | null | undefined) {
    this.editingTemplate.set(value ?? null);
    if (!value) {
      this.templateName.set('');
      return;
    }
    this.templateName.set(value.name || 'Invoice template');
    this.templateId.set(value.id);
    this.templatePath.set(value.bodyStoragePath || value.storagePath);
    this.format.set(value.format || 'docx');
    this.loadTemplateUrl(value.bodyStoragePath || value.storagePath);
  }
  @Output() uploaded = new EventEmitter<string>();   // emits storage path on success
  @Output() cancel = new EventEmitter<void>();
  private authUser$ = inject(CURRENT_AUTH_USER);
  private db = inject(Firestore);
  private storage = inject(Storage);
  private activityService = inject(ActivityService);
  private templateService = inject(TemplateService);
  private pdfTemplateService = inject(PdfTemplateService);
  private dialogData = inject<{ inDialog?: boolean; existingTemplate?: CompanyTemplate | null }>(DIALOG_DATA, { optional: true });
  private dialogRef = inject(DialogRef<string | null>, { optional: true });



  // State
  companyId = signal<string | null>(null);
  templateId = signal<string | null>(null);
  templatePath = signal<string | null>(null);
  templateUrl = signal<string | null>(null);
  editingTemplate = signal<CompanyTemplate | null>(null);
  templateName = signal('');
  lockedFormat = signal<CompanyTemplateFormat | null>(null);

  // File
  file = signal<File | null>(null);
  error = signal<string | null>(null);
  info = signal<string | null>(null);

  // Upload
  uploading = signal(false);
  progress = signal<number>(0);
  pdfMapping = signal<PdfTemplateMapping | null>(null);
  analyzing = signal(false);
  rendering = signal(false);
  private currentTask: { cancel: () => void } | null = null;

  // Config
  readonly maxSizeMB = 5;
  readonly formatOptions: { value: CompanyTemplateFormat; label: string; description: string; ext: string }[] = [
    { value: 'docx', label: 'Word DOCX', description: 'Current Word template renderer.', ext: '.docx' },
    { value: 'freemarker-html', label: 'Designed FreeMarker/HTML', description: 'HTML body using {{variable}} or ${variable} placeholders.', ext: '.html' },
    { value: 'pdf-mapped', label: 'PDF-mapped', description: 'Upload Canva or design-tool PDFs and map regions to invoice variables.', ext: '.pdf' }
  ];
  format = signal<CompanyTemplateFormat>('docx');
  readonly requiredVariables: Record<CompanyTemplateFormat, string[]> = {
    docx: requiredVariablesForTemplate('invoice', 'docx').map(variableLabel),
    'freemarker-html': requiredVariablesForTemplate('invoice', 'freemarker-html').map(variableLabel),
    'pdf-mapped': requiredVariablesForTemplate('invoice', 'pdf-mapped').map(variableLabel)
  };

  constructor() {
    if (this.dialogData) {
      this.inDialog = this.dialogData.inDialog ?? true;
      this.existingTemplate = this.dialogData.existingTemplate;
    }
    // Load current user -> company -> template path/url
    this.authUser$.pipe(take(1)).subscribe(async (user) => {
      if (!user) { this.error.set('Not signed in'); return; }
      const userRef = doc(this.db, `users/${user.uid}`);
      const sub = docData(userRef).subscribe(async (u: any) => {
        const cid = u?.companyId ?? null;
        this.companyId.set(cid);
        if (!cid) return;
        collectionData(collection(this.db, `companies/${cid}/templates`), { idField: 'id' }).subscribe(async (templates: any[]) => {
          if (this.editingTemplate()) return;
          const c = templates.find(template => template.type === 'invoice' && template.isDefault && !template.archived)
            ?? templates.find(template => template.type === 'invoice' && !template.archived);
          if (c?.format && !this.lockedFormat()) this.format.set(c.format);
          const path = c?.storagePath ?? null;
          this.templateId.set(c?.id ?? null);
          this.templatePath.set(path);
          if (path) {
            try {
              const url = await getDownloadURL(ref(this.storage, path));
              this.templateUrl.set(url);
            } catch {
              this.templateUrl.set(null);
            }
          } else {
            this.templateUrl.set(null);
          }
        });
      });
    });
  }

  private async loadTemplateUrl(path: string | null): Promise<void> {
    if (!path) {
      this.templateUrl.set(null);
      return;
    }
    try {
      this.templateUrl.set(await getDownloadURL(ref(this.storage, path)));
    } catch {
      this.templateUrl.set(null);
    }
  }

  onPickClicked(input: HTMLInputElement) {
    input.click();
  }

  onFilePicked(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    if (f) this.setFile(f);
    input.value = ''; // allow re-select same file
  }

  onDrop(ev: DragEvent) {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0] ?? null;
    if (f) this.setFile(f);
  }
  onDragOver(ev: DragEvent) { ev.preventDefault(); }

  async setFile(f: File) {
    this.error.set(null);
    // Validate ext
    const name = f.name.toLowerCase();
    const expectedExt = this.formatOptions.find(option => option.value === this.format())?.ext || '.docx';
    const okExt = name.endsWith(expectedExt);
    if (!okExt) {
      this.error.set(`Please upload a ${expectedExt} template file.`);
      this.file.set(null);
      return;
    }
    // Validate size
    const maxBytes = this.maxSizeMB * 1024 * 1024;
    if (f.size > maxBytes) {
      this.error.set(`File too large. Max ${this.maxSizeMB}MB.`);
      this.file.set(null);
      return;
    }
    const inspection = await this.templateService.inspectTemplateFile(f, this.format(), 'invoice');
    if (inspection.errors.length) {
      this.error.set(inspection.errors.join(' '));
      this.file.set(null);
      return;
    }
    this.file.set(f);
    const warnings = inspection.warnings.length ? ` • Warnings: ${inspection.warnings.join(' ')}` : '';
    this.info.set(`${f.name} • ${(f.size / 1024 / 1024).toFixed(2)} MB • ${this.formatLabel()} • Variables: ${inspection.variables.join(', ') || 'none'}${warnings}`);
  }

  async upload() {
    this.error.set(null);
    const f = this.file();
    const cid = this.companyId();
    if (!f || !cid) { this.error.set('No file or company'); return; }

    this.uploading.set(true);
    this.progress.set(0);

    try {
      const existing = this.editingTemplate();
      const result = await this.templateService.upload(cid, f, 'invoice', existing?.id, {
        format: this.format(),
        name: this.templateName(),
        existingTemplate: existing || undefined
      });
      const url = await getDownloadURL(ref(this.storage, result.path));
      this.templateId.set(result.template.id);
      this.templatePath.set(result.path);
      this.templateUrl.set(url);
      this.info.set('Template uploaded successfully.');
      this.editingTemplate.set(result.template);
      this.templateName.set(result.template.name);
      if (this.format() === 'pdf-mapped') await this.analyzePdfTemplate(result.template.id, result.path);
      this.file.set(null);
      this.progress.set(100);
      this.uploaded.emit(result.path);
      this.dialogRef?.close(result.path);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to save template path.');
    } finally {
      this.uploading.set(false);
      this.progress.set(0);
      this.currentTask = null;
    }
  }

  async saveName(): Promise<void> {
    const cid = this.companyId();
    const template = this.editingTemplate();
    const name = this.templateName().trim();
    if (!cid || !template || !name) return;
    try {
      await this.templateService.renameTemplate(cid, template.id, name);
      this.editingTemplate.set({ ...template, name });
      this.info.set('Template name saved.');
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to rename template.');
    }
  }

  onFormatChanged(format: CompanyTemplateFormat): void {
    this.format.set(format);
    this.file.set(null);
    this.info.set(null);
    this.error.set(null);
    this.pdfMapping.set(null);
  }

  formatLabel(): string {
    return this.formatOptions.find(option => option.value === this.format())?.label || 'Word DOCX';
  }

  acceptList(): string {
    return this.formatOptions.find(option => option.value === this.format())?.ext || '.docx';
  }


  async analyzePdfTemplate(templateId = this.templateId(), sourcePdfPath = this.templatePath()): Promise<void> {
    const cid = this.companyId();
    if (!cid || !templateId || !sourcePdfPath) return;
    this.analyzing.set(true);
    try {
      const mapping = await this.pdfTemplateService.analyze({ companyId: cid, templateId, sourcePdfPath });
      this.pdfMapping.set(mapping);
      this.info.set(`PDF analyzed: ${mapping.regions.length} editable regions detected.`);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to analyze PDF template.');
    } finally {
      this.analyzing.set(false);
    }
  }

  async assignRegionVariable(regionId: string, variableKey: string): Promise<void> {
    const mapping = this.pdfMapping();
    const cid = this.companyId();
    const templateId = this.templateId();
    if (!mapping || !cid || !templateId) return;
    const updated = { ...mapping, regions: mapping.regions.map(region => region.id === regionId ? { ...region, variableKey } : region) };
    this.pdfMapping.set(updated);
    await this.pdfTemplateService.saveMapping(cid, templateId, updated);
  }

  async renderSamplePdf(): Promise<void> {
    const cid = this.companyId();
    const templateId = this.templateId();
    if (!cid || !templateId) return;
    this.rendering.set(true);
    try {
      const result = await this.pdfTemplateService.render({
        companyId: cid,
        templateId,
        variables: { invoice: { number: 'INV-001', date: '2026-07-24', total: '$1,234.00', items: 'Design services' }, client: { name: 'Acme Ltd', email: 'accounts@example.com' }, company: { name: 'Your Company' } }
      });
      this.info.set(`Sample PDF rendered to ${result.storagePath}.`);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to render sample PDF.');
    } finally {
      this.rendering.set(false);
    }
  }

  variableOptions(): string[] {
    return this.pdfTemplateService.variableOptions();
  }

  variableLabel(variable: string): string { return variableLabel(variable); }

  cancelUpload() {
    if (this.currentTask) {
      this.currentTask.cancel();
      this.uploading.set(false);
      this.progress.set(0);
      this.info.set(null);
    }
    this.cancel.emit();
    this.dialogRef?.close(null);
  }

  async removeTemplate() {
    this.error.set(null);
    const cid = this.companyId();
    const path = this.templatePath();
    if (!cid || !path) return;

    try {
      const id = this.templateId();
      if (!id) throw new Error('Template document not found.');
      await this.activityService.track(
        cid,
        'update',
        `companies/${cid}/templates/${id}`,
        'Removed invoice template.',
        () => this.templateService.deleteTemplate(cid, { id, companyId: cid, type: 'invoice', name: 'Invoice template', format: this.format(), bodyStoragePath: path, storagePath: path })
      );
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to remove template.');
      return;
    }
    this.templatePath.set(null);
    this.templateUrl.set(null);
    this.info.set('Template removed.');
  }
}
