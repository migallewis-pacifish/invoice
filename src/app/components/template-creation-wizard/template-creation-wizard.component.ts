import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { UploadTemplateComponent } from '../../pages/upload-template/upload-template.component';
import { createStarterEmailTemplates, StarterEmailTemplate } from '../../features/email-template-designer/email-template-starter-catalog';
import { EmailTemplateDesignerComponent } from '../../features/email-template-designer/email-template-designer.component';

type CreationFormat = 'docx' | 'freemarker';
type WizardStep = 'type' | 'configure';

@Component({
  selector: 'app-template-creation-wizard',
  standalone: true,
  imports: [CommonModule, UploadTemplateComponent],
  templateUrl: './template-creation-wizard.component.html',
  styleUrl: './template-creation-wizard.component.scss'
})
export class TemplateCreationWizardComponent {
  private readonly dialogRef = inject<DialogRef<string | null>>(DialogRef);
  private readonly dialog = inject(Dialog);

  readonly step = signal<WizardStep>('type');
  readonly format = signal<CreationFormat | null>(null);
  readonly starters = createStarterEmailTemplates();

  selectFormat(format: CreationFormat): void {
    this.format.set(format);
  }

  next(): void {
    if (this.format()) this.step.set('configure');
  }

  back(): void {
    this.step.set('type');
  }

  close(result: string | null = null): void {
    this.dialogRef.close(result);
  }

  chooseStarter(starter: StarterEmailTemplate): void {
    this.dialogRef.close(null);
    queueMicrotask(() => this.openDesigner(starter.id));
  }

  startBlank(): void {
    this.dialogRef.close(null);
    queueMicrotask(() => this.openDesigner());
  }

  private openDesigner(starterId?: string): void {
    this.dialog.open(EmailTemplateDesignerComponent, {
      data: { dialogMode: true, starterId },
      width: 'min(96vw, 1720px)',
      maxWidth: '1720px',
      maxHeight: '96vh',
      backdropClass: 'dlg-backdrop',
      panelClass: 'email-designer-dialog-panel'
    });
  }
}
