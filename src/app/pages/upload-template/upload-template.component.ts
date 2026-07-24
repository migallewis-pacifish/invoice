import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { collection, collectionData, doc, docData, Firestore } from '@angular/fire/firestore';
import { getDownloadURL, ref, Storage } from '@angular/fire/storage';
import { take } from 'rxjs';
import { RouterLink } from '@angular/router';
import { ActivityService } from '../../services/activity.service';
import { TemplateService } from '../../services/template.service';
import { CompanyTemplateFormat, PdfTemplateMapping } from '../../models/invoice.model';
import { PdfTemplateService } from '../../services/pdf-template.service';
import { CURRENT_AUTH_USER } from '../../services/company-context.service';

@Component({
  selector: 'app-upload-template',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './upload-template.component.html',
  styleUrl: './upload-template.component.scss'
})
export class UploadTemplateComponent {
  @Input() inDialog = false;                         // hide page-only bits when in a dialog
  @Output() uploaded = new EventEmitter<string>();   // emits storage path on success
  @Output() cancel = new EventEmitter<void>();
  private authUser$ = inject(CURRENT_AUTH_USER);
  private db = inject(Firestore);
  private storage = inject(Storage);
  private activityService = inject(ActivityService);
  private templateService = inject(TemplateService);
  private pdfTemplateService = inject(PdfTemplateService);



  // State
  companyId = signal<string | null>(null);
  templateId = signal<string | null>(null);
  templatePath = signal<string | null>(null);
  templateUrl = signal<string | null>(null);

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
    docx: ['invoice_number', 'invoice_date', 'client_name', 'items', 'total'],
    'freemarker-html': ['invoice_number', 'invoice_date', 'client_name', 'items', 'total'],
    'pdf-mapped': []
  };

  constructor() {
    // Load current user -> company -> template path/url
    this.authUser$.pipe(take(1)).subscribe(async (user) => {
      if (!user) { this.error.set('Not signed in'); return; }
      const userRef = doc(this.db, `users/${user.uid}`);
      const sub = docData(userRef).subscribe(async (u: any) => {
        const cid = u?.companyId ?? null;
        this.companyId.set(cid);
        if (!cid) return;
        collectionData(collection(this.db, `companies/${cid}/templates`), { idField: 'id' }).subscribe(async (templates: any[]) => {
          const c = templates.find(template => template.type === 'invoice' && template.isDefault && !template.archived)
            ?? templates.find(template => template.type === 'invoice' && !template.archived);
          if (c?.format) this.format.set(c.format);
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

  setFile(f: File) {
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
    this.file.set(f);
    this.info.set(`${f.name} • ${(f.size / 1024 / 1024).toFixed(2)} MB • ${this.formatLabel()}`);
  }

  async upload() {
    this.error.set(null);
    const f = this.file();
    const cid = this.companyId();
    if (!f || !cid) { this.error.set('No file or company'); return; }

    this.uploading.set(true);
    this.progress.set(0);

    try {
      const result = await this.templateService.upload(cid, f, 'invoice', undefined, { format: this.format() });
      const url = await getDownloadURL(ref(this.storage, result.path));
      this.templateId.set(result.template.id);
      this.templatePath.set(result.path);
      this.templateUrl.set(url);
      this.info.set('Template uploaded successfully.');
      if (this.format() === 'pdf-mapped') await this.analyzePdfTemplate(result.template.id, result.path);
      this.file.set(null);
      this.progress.set(100);
      this.uploaded.emit(result.path);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to save template path.');
    } finally {
      this.uploading.set(false);
      this.progress.set(0);
      this.currentTask = null;
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

  cancelUpload() {
    if (this.currentTask) {
      this.currentTask.cancel();
      this.uploading.set(false);
      this.progress.set(0);
      this.info.set(null);

      // 🔽 notify dialog wrapper
      this.cancel.emit();
    }
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
