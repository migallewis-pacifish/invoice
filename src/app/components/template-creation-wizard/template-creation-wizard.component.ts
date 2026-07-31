import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { UploadTemplateComponent } from '../../pages/upload-template/upload-template.component';
import { createStarterEmailTemplates, StarterEmailTemplate } from '../../features/email-template-designer/email-template-starter-catalog';
import { EmailTemplateDesignerComponent } from '../../features/email-template-designer/email-template-designer.component';
import { CompanyTemplateFormat } from '../../models/invoice.model';

export type TemplateCreationType = 'invoice' | 'letter' | 'email';
export type TemplateCreationFormat = Extract<CompanyTemplateFormat, 'docx' | 'freemarker-html'>;
type WizardStep = 'type' | 'format' | 'configure';

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
  readonly creationType = signal<TemplateCreationType | null>(null);
  readonly format = signal<TemplateCreationFormat | null>(null);
  readonly starters = createStarterEmailTemplates();

  selectType(type: TemplateCreationType): void {
    this.creationType.set(type);
    this.format.set(null);
  }

  selectFormat(format: TemplateCreationFormat): void {
    this.format.set(format);
  }

  next(): void {
    if (this.step() === 'type' && this.creationType()) {
      this.step.set(this.creationType() === 'email' ? 'configure' : 'format');
      return;
    }
    if (this.step() === 'format' && this.format()) this.step.set('configure');
  }

  back(): void {
    if (this.step() === 'configure' && this.creationType() !== 'email') {
      this.step.set('format');
      return;
    }
    this.step.set('type');
  }

  documentType(): 'invoice' | 'letter' {
    return this.creationType() === 'letter' ? 'letter' : 'invoice';
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
