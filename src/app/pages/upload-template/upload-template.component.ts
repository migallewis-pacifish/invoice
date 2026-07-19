import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { collection, collectionData, doc, docData, Firestore } from '@angular/fire/firestore';
import { getDownloadURL, ref, Storage } from '@angular/fire/storage';
import { take } from 'rxjs';
import { ActivityService } from '../../services/activity.service';
import { TemplateService } from '../../services/template.service';
import { CURRENT_AUTH_USER } from '../../services/company-context.service';

@Component({
  selector: 'app-upload-template',
  standalone: true,
  imports: [CommonModule],
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
  private currentTask: { cancel: () => void } | null = null;

  // Config
  readonly maxSizeMB = 5;
  readonly allowedExt = ['.docx'];

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
    const okExt = this.allowedExt.some(ext => name.endsWith(ext));
    if (!okExt) {
      this.error.set('Please upload a .docx Word file.');
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
    this.info.set(`${f.name} • ${(f.size / 1024 / 1024).toFixed(2)} MB`);
  }

  async upload() {
    this.error.set(null);
    const f = this.file();
    const cid = this.companyId();
    if (!f || !cid) { this.error.set('No file or company'); return; }

    this.uploading.set(true);
    this.progress.set(0);

    try {
      const result = await this.templateService.upload(cid, f, 'invoice');
      const url = await getDownloadURL(ref(this.storage, result.path));
      this.templateId.set(result.template.id);
      this.templatePath.set(result.path);
      this.templateUrl.set(url);
      this.info.set('Template uploaded successfully.');
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
        () => this.templateService.deleteTemplate(cid, { id, companyId: cid, type: 'invoice', name: 'Invoice template', storagePath: path })
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
