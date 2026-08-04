import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface ImageUploadRequest {
  file: File;
  name?: string;
}

@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-upload.component.html',
  styleUrl: './image-upload.component.scss'
})
export class ImageUploadComponent implements OnDestroy {
  @Input() title = 'Upload image';
  @Input() description = 'Choose an image to upload.';
  @Input() buttonLabel = 'Upload image';
  @Input() previewAlt = 'Current uploaded image';
  @Input() variant: 'logo' | 'signature' = 'logo';
  @Input() requireName = false;
  @Input() nameLabel = 'Name';
  @Input() namePlaceholder = '';
  @Input() maxSizeMB = 2;
  @Input() busy = false;
  @Input() set currentUrl(value: string | null | undefined) {
    const next = value || '';
    if (next && next !== this.savedUrl() && this.selectedFile()) this.clear();
    this.savedUrl.set(next);
  }
  @Input() set currentName(value: string | null | undefined) {
    if (!this.selectedFile()) this.assetName.set(value || '');
  }

  @Output() upload = new EventEmitter<ImageUploadRequest>();

  readonly savedUrl = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly selectedPreviewUrl = signal('');
  readonly assetName = signal('');
  readonly error = signal('');
  readonly dragging = signal(false);

  get previewUrl(): string { return this.selectedPreviewUrl() || this.savedUrl(); }
  get canUpload(): boolean { return !!this.selectedFile() && (!this.requireName || !!this.assetName().trim()) && !this.busy; }

  choose(input: HTMLInputElement): void { if (!this.busy) input.click(); }
  dragOver(event: DragEvent): void { event.preventDefault(); if (!this.busy) this.dragging.set(true); }
  dragLeave(): void { this.dragging.set(false); }
  drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setFile(file);
  }
  filePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setFile(file);
    input.value = '';
  }
  clear(): void {
    this.revokePreview();
    this.selectedFile.set(null);
    this.error.set('');
  }
  submit(): void {
    const file = this.selectedFile();
    if (!file || !this.canUpload) return;
    this.upload.emit({ file, ...(this.requireName ? { name: this.assetName().trim() } : {}) });
  }

  ngOnDestroy(): void { this.revokePreview(); }

  private setFile(file: File): void {
    this.error.set('');
    if (!file.type.startsWith('image/')) {
      this.error.set('Please choose an image file.');
      return;
    }
    if (file.size > this.maxSizeMB * 1024 * 1024) {
      this.error.set(`Image must be smaller than ${this.maxSizeMB} MB.`);
      return;
    }
    this.revokePreview();
    this.selectedFile.set(file);
    this.selectedPreviewUrl.set(URL.createObjectURL(file));
  }

  private revokePreview(): void {
    const url = this.selectedPreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.selectedPreviewUrl.set('');
  }
}
