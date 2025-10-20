import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { doc, docData, Firestore, updateDoc } from '@angular/fire/firestore';
import { deleteObject, getDownloadURL, ref, Storage, uploadBytesResumable } from '@angular/fire/storage';
import { take } from 'rxjs';

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
  private auth = inject(Auth);
  private db = inject(Firestore);
  private storage = inject(Storage);



  // State
  companyId = signal<string | null>(null);
  templatePath = signal<string | null>(null);
  templateUrl = signal<string | null>(null);

  // File
  file = signal<File | null>(null);
  error = signal<string | null>(null);
  info = signal<string | null>(null);

  // Upload
  uploading = signal(false);
  progress = signal<number>(0);
  private currentTask: ReturnType<typeof uploadBytesResumable> | null = null;

  // Config
  readonly maxSizeMB = 5;
  readonly allowedExt = ['.docx'];

  constructor() {
    // Load current user -> company -> template path/url
    authState(this.auth).pipe(take(1)).subscribe(async (user) => {
      if (!user) { this.error.set('Not signed in'); return; }
      const userRef = doc(this.db, `users/${user.uid}`);
      const sub = docData(userRef).subscribe(async (u: any) => {
        const cid = u?.companyId ?? null;
        this.companyId.set(cid);
        if (!cid) return;
        const compRef = doc(this.db, `companies/${cid}`);
        docData(compRef).subscribe(async (c: any) => {
          const path = c?.templatePath ?? null;
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

    // Decide storage path (replace same filename)
    // If you want versioned files, append a timestamp to name.
    const path = `companies/${cid}/templates/invoice.docx`;
    const storageRef = ref(this.storage, path);

    this.uploading.set(true);
    this.progress.set(0);

    const task = uploadBytesResumable(storageRef, f, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    this.currentTask = task;

    task.on('state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        this.progress.set(pct);
      },
      (err) => {
        this.uploading.set(false);
        this.error.set(err?.message ?? 'Upload failed');
      },
      async () => {
        try {
          await updateDoc(doc(this.db, `companies/${cid}`), { templatePath: path });
          const url = await getDownloadURL(storageRef);
          this.templatePath.set(path);
          this.templateUrl.set(url);
          this.info.set('Template uploaded successfully.');
          this.file.set(null);

          // 🔽 notify dialog wrapper
          this.uploaded.emit(path);
        } catch (e: any) {
          this.error.set(e?.message ?? 'Failed to save template path.');
        } finally {
          this.uploading.set(false);
          this.progress.set(0);
          this.currentTask = null;
        }
      }
    );
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
      await deleteObject(ref(this.storage, path));
    } catch {
      // ignore missing file
    }
    await updateDoc(doc(this.db, `companies/${cid}`), { templatePath: null });
    this.templatePath.set(null);
    this.templateUrl.set(null);
    this.info.set('Template removed.');
  }
}
