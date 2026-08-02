import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, signal } from '@angular/core';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { UploadTemplateComponent } from '../../pages/upload-template/upload-template.component';
import { createStarterEmailTemplates, StarterEmailTemplate } from '../../features/email-template-designer/email-template-starter-catalog';
import { EmailTemplateDesignerComponent } from '../../features/email-template-designer/email-template-designer.component';
import { CompanyTemplateFormat } from '../../models/invoice.model';
import { CURRENT_AUTH_USER } from '../../services/company-context.service';
import { TemplateService } from '../../services/template.service';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { firstValueFrom, take } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

export type TemplateCreationType = 'invoice' | 'letter' | 'email';
export type TemplateCreationFormat = Extract<CompanyTemplateFormat, 'docx' | 'freemarker-html'>;
type WizardStep = 'type' | 'format' | 'configure';

export interface FreemarkerStarterTemplate {
  id: string;
  name: string;
  description: string;
  accent: string;
  path: string;
}

const FREEMARKER_STARTER_IDS = ['azure-ledger', 'midnight-teal', 'sage-studio', 'coral-sidebar', 'monochrome-grid', 'violet-gradient', 'tricolour-sidebar'];

export const FREEMARKER_INVOICE_TEMPLATES: FreemarkerStarterTemplate[] = [
  starter('azure-ledger', 'Azure Ledger', 'A crisp blue header with a classic ledger layout.', '#3478d4'),
  starter('midnight-teal', 'Midnight Teal', 'A dark, polished invoice with teal highlights.', '#1b9c96'),
  starter('sage-studio', 'Sage Studio', 'A calm editorial design with soft green details.', '#779b78'),
  starter('coral-sidebar', 'Coral Sidebar', 'A warm, modern layout with a bold side panel.', '#ed765f'),
  starter('monochrome-grid', 'Monochrome Grid', 'A minimal black-and-white professional layout.', '#202020'),
  starter('violet-gradient', 'Violet Gradient', 'A vibrant contemporary invoice with violet accents.', '#7357d9'),
  starter('tricolour-sidebar', 'Tricolour Sidebar', 'A structured sidebar design with three brand colours.', '#318b91')
];

function starter(id: string, name: string, description: string, accent: string): FreemarkerStarterTemplate {
  const index = FREEMARKER_STARTER_IDS.indexOf(id) + 1;
  return { id, name, description, accent, path: `/templates/invoices/${String(index).padStart(2, '0')}-${id}.ftl` };
}

@Component({
  selector: 'app-template-creation-wizard',
  standalone: true,
  imports: [CommonModule, UploadTemplateComponent],
  templateUrl: './template-creation-wizard.component.html',
  styleUrl: './template-creation-wizard.component.scss'
})
export class TemplateCreationWizardComponent implements OnDestroy {
  private readonly dialogRef = inject<DialogRef<string | null>>(DialogRef);
  private readonly dialog = inject(Dialog);
  private readonly authUser$ = inject(CURRENT_AUTH_USER);
  private readonly db = inject(Firestore);
  private readonly templateService = inject(TemplateService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly step = signal<WizardStep>('type');
  readonly creationType = signal<TemplateCreationType | null>(null);
  readonly format = signal<TemplateCreationFormat | null>(null);
  readonly starters = createStarterEmailTemplates();
  readonly freemarkerStarters = FREEMARKER_INVOICE_TEMPLATES;
  readonly selectedFreemarker = signal<FreemarkerStarterTemplate | null>(null);
  readonly freemarkerPreview = signal<SafeResourceUrl | null>(null);
  readonly freemarkerBusy = signal(false);
  readonly freemarkerError = signal<string | null>(null);
  private previewObjectUrl: string | null = null;

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

  async selectFreemarker(starter: FreemarkerStarterTemplate): Promise<void> {
    this.selectedFreemarker.set(starter);
    this.freemarkerError.set(null);
    this.releasePreview();
    try {
      const source = await this.fetchStarter(starter);
      const preview = source
        .replace(/<#[^>]*>/g, '')
        .replace(/<\/#(?:if|list)>/g, '')
        .replace(/\$\{[^}]+}/g, 'Sample');
      this.previewObjectUrl = URL.createObjectURL(new Blob([preview], { type: 'text/html' }));
      this.freemarkerPreview.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.previewObjectUrl));
    } catch {
      this.freemarkerError.set('The template preview could not be loaded. Please try another template.');
    }
  }

  async useSelectedFreemarker(): Promise<void> {
    const starter = this.selectedFreemarker();
    if (!starter || this.freemarkerBusy()) return;
    this.freemarkerBusy.set(true);
    this.freemarkerError.set(null);
    try {
      const user = await firstValueFrom(this.authUser$.pipe(take(1)));
      if (!user) throw new Error('Sign in to add a template.');
      const profile = await firstValueFrom(docData(doc(this.db, `users/${user.uid}`)).pipe(take(1))) as any;
      if (!profile?.companyId) throw new Error('No company is linked to your account.');
      const source = await this.fetchStarter(starter);
      const file = new File([source], `${starter.id}.html`, { type: 'text/html' });
      const result = await this.templateService.upload(profile.companyId, file, 'invoice', undefined, {
        format: 'freemarker-html',
        name: starter.name
      });
      this.close(result.path);
    } catch (error: any) {
      this.freemarkerError.set(error?.message || 'The template could not be added. Please try again.');
    } finally {
      this.freemarkerBusy.set(false);
    }
  }

  ngOnDestroy(): void {
    this.releasePreview();
  }

  private async fetchStarter(starter: FreemarkerStarterTemplate): Promise<string> {
    const response = await fetch(starter.path);
    if (!response.ok) throw new Error(`Unable to load ${starter.name}.`);
    return response.text();
  }

  private releasePreview(): void {
    if (this.previewObjectUrl) URL.revokeObjectURL(this.previewObjectUrl);
    this.previewObjectUrl = null;
    this.freemarkerPreview.set(null);
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
