import { DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';

@Component({
  selector: 'app-link-folder-dialogue',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './link-folder-dialogue.component.html',
  styleUrl: './link-folder-dialogue.component.scss'
})
export class LinkFolderDialogueComponent {
  private dialog = inject(DialogRef<{
    provider: 'local' | 'google' | 'onedrive' | null;
    path: string | null;
  } | null>);

  step = signal(1);
  selectedProvider = signal<'local' | 'google' | 'onedrive' | null>(null);
  folderPath = signal<string | null>(null);

  /** --- STEP 1 --- **/
  selectProvider(provider: 'local' | 'google' | 'onedrive') {
    this.selectedProvider.set(provider);
    if (provider === 'local') this.step.set(2);
    else this.step.set(3); // placeholders for future integrations
  }

  /** --- STEP 2 (Local folder) --- **/
  pickFolder() {
    const input = document.createElement('input');
    input.type = 'file';
    (input as any).webkitdirectory = true;
    input.multiple = false;
    input.onchange = (e: any) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const firstPath = files[0].webkitRelativePath.split('/')[0];
        this.folderPath.set(firstPath);
      }
    };
    input.click();
  }

  back() {
    this.step.update(s => Math.max(1, s - 1));
  }

  confirm() {
    const result = {
      provider: this.selectedProvider(),
      path: this.folderPath()
    };
    this.dialog.close(result);
  }

  close() {
    this.dialog.close(null);
  }
}
