import { Component, inject } from '@angular/core';
import { UploadTemplateComponent } from '../../pages/upload-template/upload-template.component';
import { DialogRef } from '@angular/cdk/dialog';

@Component({
  selector: 'app-upload-template-dialogue',
  standalone: true,
  imports: [UploadTemplateComponent],
  templateUrl: './upload-template-dialogue.component.html',
  styleUrl: './upload-template-dialogue.component.scss'
})
export class UploadTemplateDialogueComponent {
  private ref = inject(DialogRef<string | null>);

  onUploaded(path: string) {
    // close and return the new template path to the opener
    this.ref.close(path);
  }
  close() { this.ref.close(null); }
}
