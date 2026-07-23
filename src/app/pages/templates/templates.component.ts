import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { collection, collectionData, Firestore } from '@angular/fire/firestore';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { WorkspaceTopbarComponent } from '../../components/workspace-topbar/workspace-topbar.component';
import { CompanyTemplate } from '../../models/invoice.model';
import { normalizeTemplateFormat } from '../../services/template-renderer.service';
import { TemplateService } from '../../services/template.service';
import { LetterDocxService } from '../../services/letter-docx.service';
import { CompanyContextService } from '../../services/company-context.service';
import { UploadTemplateComponent } from '../upload-template/upload-template.component';
import { CompanyEmailTemplate, EMAIL_TEMPLATE_VARIABLE_LABELS, EMAIL_TEMPLATE_VARIABLES } from '../../models/company-email-template.model';
import { EmailTemplateService, validateEmailTemplate } from '../../services/email-template.service';
import { WorkspaceShellComponent } from '../../components/workspace-shell/workspace-shell.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { EmailTemplateDefinition, EmailTemplateScenario } from '../../models/email-template-designer.model';
import { EMAIL_TEMPLATE_SCENARIOS, EmailTemplateDefinitionService } from '../../features/email-template-designer/services/email-template-definition.service';
import { Dialog } from '@angular/cdk/dialog';
import { EmailTemplateDesignerComponent } from '../../features/email-template-designer/email-template-designer.component';
import { createStarterEmailTemplates, cloneStarterEmailTemplate, StarterEmailTemplate } from '../../features/email-template-designer/email-template-starter-catalog';
import { EmailTemplateBuilderService } from '../../features/email-template-designer/services/email-template-builder.service';
import { EmailTemplatePreviewDataService } from '../../features/email-template-designer/services/email-template-preview-data.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

type TemplateType = 'invoice' | 'letter';
type TemplateTab = 'overview' | 'gallery' | 'emails';

export interface TemplateDocument extends CompanyTemplate {
  category?: string;
  description?: string;
  fileUrl: string;
  previewUrl?: string;
  active: boolean;
  archived?: boolean;
}

export interface TemplateCard extends TemplateDocument {
  accent: 'invoice' | 'letter' | 'professional';
}


export type TemplateFilter = 'active' | 'archived' | TemplateType;

export function filterTemplates(templates: TemplateCard[], filter: TemplateFilter): TemplateCard[] {
  switch (filter) {
    case 'invoice':
    case 'letter':
      return templates.filter(template => template.type === filter && !template.archived);
    case 'archived':
      return templates.filter(template => !!template.archived);
    case 'active':
    default:
      return templates.filter(template => template.active && !template.archived);
  }
}

@Component({
  selector: 'app-templates',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, NavBarComponent, WorkspaceTopbarComponent, UploadTemplateComponent, WorkspaceShellComponent, EmptyStateComponent],
  templateUrl: './templates.component.html',
  styleUrl: './templates.component.scss'
})
export class TemplatesComponent {
  private db = inject(Firestore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private templateService = inject(TemplateService);
  private letterDocx = inject(LetterDocxService);
  private companyContext = inject(CompanyContextService);
  private emailTemplateService = inject(EmailTemplateService);
  private emailTemplateDefinitions = inject(EmailTemplateDefinitionService);
  private fb = inject(FormBuilder);
  private dialog = inject(Dialog);
  private emailBuilder = inject(EmailTemplateBuilderService);
  private previewData = inject(EmailTemplatePreviewDataService);
  private sanitizer = inject(DomSanitizer);

  protected readonly showUpload = signal(false);
  protected readonly activeTab = signal<TemplateTab>('overview');
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly templates = signal<TemplateCard[]>([]);
  protected readonly filter = signal<'active' | 'archived' | TemplateType>('active');
  protected readonly emailTemplates = signal<CompanyEmailTemplate[]>([]);
  protected readonly designedEmailTemplates = signal<EmailTemplateDefinition[]>([]);
  protected readonly starterEmailTemplates = createStarterEmailTemplates();
  protected readonly previewEmailTemplate = signal<EmailTemplateDefinition | StarterEmailTemplate | null>(null);
  protected readonly previewEmailHtml = signal<SafeHtml>('');
  protected readonly scenarios = EMAIL_TEMPLATE_SCENARIOS;
  protected readonly selectedEmailTemplate = signal<CompanyEmailTemplate | null>(null);
  protected readonly emailTemplateMessage = signal('');
  protected readonly variables = EMAIL_TEMPLATE_VARIABLES;
  protected readonly variableLabels = EMAIL_TEMPLATE_VARIABLE_LABELS;

  protected readonly emailTemplateForm = this.fb.nonNullable.group({
    subject: ['', [Validators.required]],
    body: ['', [Validators.required]]
  });

  constructor() {
    if (this.route.snapshot.queryParamMap.get('tab') === 'emails') this.activeTab.set('emails');
    this.loadCompanyTemplates();
  }

  protected readonly activeTemplates = computed(() => filterTemplates(this.templates(), this.filter()));
  protected readonly invoiceTemplateCount = computed(() => this.templates().filter(template => template.type === 'invoice' && !template.archived).length);
  protected readonly letterTemplateCount = computed(() => this.templates().filter(template => template.type === 'letter' && !template.archived).length);
  protected readonly emailTemplateCount = computed(() => this.designedEmailTemplates().filter(template => !template.archived).length);
  protected readonly formatLabels: Record<string, string> = { docx: 'Word DOCX', 'freemarker-html': 'FreeMarker/HTML', 'pdf-mapped': 'PDF-mapped' };
  protected readonly totalTemplateCount = computed(() => this.templates().filter(template => template.active && !template.archived).length + this.emailTemplateCount());

  protected setTab(tab: TemplateTab): void {
    this.activeTab.set(tab);
    if (tab !== 'gallery') this.showUpload.set(false);
  }

  protected openUploadFlow(): void {
    this.activeTab.set('gallery');
    this.showUpload.set(true);
    queueMicrotask(() => document.getElementById('template-upload')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected onUploaded(): void {
    this.showUpload.set(false);
  }

  protected onFilter(): void {
    const options: TemplateFilter[] = ['active', 'invoice', 'letter', 'archived'];
    const current = this.filter();
    this.filter.set(options[(options.indexOf(current) + 1) % options.length]);
  }

  protected editTemplate(template: TemplateCard): void {
    if (template.type === 'invoice') {
      this.openUploadFlow();
      return;
    }
    document.getElementById('letter-template-upload')?.click();
  }

  protected async onLetterTemplatePicked(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    try {
      const companyId = await this.companyContext.requireCompanyIdOnce();
      await this.letterDocx.uploadTemplate(companyId, file);
      this.error.set(null);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to upload letter template.');
    }
  }

  protected async duplicateTemplate(template: TemplateCard): Promise<void> {
    try {
      const companyId = await this.companyContext.requireCompanyIdOnce();
      await this.templateService.duplicateTemplate(companyId, template);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to duplicate template.');
    }
  }

  protected async viewTemplate(template: TemplateCard): Promise<void> {
    try {
      const url = await this.templateService.getDownloadUrl(template.bodyStoragePath || template.storagePath);
      window.open(url, '_blank', 'noopener');
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to open template.');
    }
  }

  protected async openMoreMenu(template: TemplateCard): Promise<void> {
    const action = window.prompt('Choose action: archive, rename, default, duplicate, delete', template.archived ? 'archive' : 'default');
    if (!action) return;
    try {
      const companyId = await this.companyContext.requireCompanyIdOnce();
      switch (action.toLowerCase()) {
        case 'archive':
          await this.templateService.archiveTemplate(companyId, template.id, !template.archived);
          break;
        case 'rename': {
          const name = window.prompt('Template name', template.name);
          if (name) await this.templateService.renameTemplate(companyId, template.id, name);
          break;
        }
        case 'default':
        case 'set default':
          await this.templateService.setDefaultTemplate(companyId, template.id, template.type);
          break;
        case 'duplicate':
        case 'copy':
          await this.templateService.duplicateTemplate(companyId, template);
          break;
        case 'delete':
          if (window.confirm(`Delete ${template.name}?`)) await this.templateService.deleteTemplate(companyId, template);
          break;
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to update template.');
    }
  }


  protected selectEmailTemplate(template: CompanyEmailTemplate): void {
    this.selectedEmailTemplate.set(template);
    this.emailTemplateMessage.set('');
    this.emailTemplateForm.setValue({ subject: template.subject, body: template.body ?? '' });
  }

  protected insertVariable(variable: string): void {
    const body = this.emailTemplateForm.controls.body;
    body.setValue(`${body.value} {{${variable}}}`.trim());
    body.markAsDirty();
  }

  protected async saveEmailTemplate(): Promise<void> {
    const template = this.selectedEmailTemplate();
    if (!template) return;
    const value = this.emailTemplateForm.getRawValue();
    const errors = validateEmailTemplate(value.subject, value.body);
    if (errors.length) {
      this.emailTemplateMessage.set(errors.join(' '));
      return;
    }
    try {
      const companyId = await this.companyContext.requireCompanyIdOnce();
      await this.emailTemplateService.save(companyId, { ...template, subject: value.subject, body: value.body });
      this.emailTemplateMessage.set('Email template saved.');
    } catch (e: any) {
      this.emailTemplateMessage.set(e?.message ?? 'Unable to save email template.');
    }
  }

  protected async createFromStarter(starter: StarterEmailTemplate): Promise<void> {
    try {
      const companyId = await this.companyContext.requireCompanyIdOnce();
      const id = await this.emailTemplateDefinitions.save(companyId, cloneStarterEmailTemplate(starter, companyId));
      this.router.navigate(['/email-templates/designer', id]);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to create email template.');
    }
  }

  protected previewDesignedEmailTemplate(template: EmailTemplateDefinition | StarterEmailTemplate): void {
    this.previewEmailTemplate.set(template);
    const html = this.emailBuilder.buildHtml(template as EmailTemplateDefinition, value => this.previewData.renderTokens(value));
    this.previewEmailHtml.set(this.sanitizer.bypassSecurityTrustHtml(html));
  }

  protected closeEmailPreview(): void {
    this.previewEmailTemplate.set(null);
  }

  protected async duplicateDesignedEmailTemplate(template: EmailTemplateDefinition): Promise<void> {
    try {
      const companyId = await this.companyContext.requireCompanyIdOnce();
      await this.emailTemplateDefinitions.duplicate(companyId, template);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to duplicate email template.');
    }
  }

  protected async renameDesignedEmailTemplate(template: EmailTemplateDefinition): Promise<void> {
    if (!template.id) return;
    const name = window.prompt('Email template name', template.name);
    if (!name) return;
    const companyId = await this.companyContext.requireCompanyIdOnce();
    await this.emailTemplateDefinitions.rename(companyId, template.id, name);
  }

  protected async archiveDesignedEmailTemplate(template: EmailTemplateDefinition): Promise<void> {
    if (!template.id) return;
    const companyId = await this.companyContext.requireCompanyIdOnce();
    await this.emailTemplateDefinitions.archive(companyId, template.id, !template.archived);
  }

  protected async setDefaultEmailTemplate(template: EmailTemplateDefinition, scenario: EmailTemplateScenario): Promise<void> {
    if (!template.id) return;
    const companyId = await this.companyContext.requireCompanyIdOnce();
    await this.emailTemplateDefinitions.setDefaultForScenario(companyId, template, scenario);
  }

  protected scenarioLabel(scenario: EmailTemplateScenario): string {
    return this.scenarios.find(item => item.value === scenario)?.label ?? scenario;
  }

  protected compatibleScenarios(template: EmailTemplateDefinition): typeof EMAIL_TEMPLATE_SCENARIOS {
    return this.scenarios.filter(scenario => scenario.type === template.type);
  }

  protected newEmailTemplate(): void {
    this.dialog.open(EmailTemplateDesignerComponent, {
      data: { dialogMode: true },
      width: 'min(96vw, 1720px)',
      maxWidth: '1720px',
      maxHeight: '96vh',
      backdropClass: 'dlg-backdrop',
      panelClass: 'email-designer-dialog-panel'
    });
  }

  protected editDesignedEmailTemplate(template: EmailTemplateDefinition): void {
    if (template.id) this.router.navigate(['/email-templates/designer', template.id]);
  }

  private async loadCompanyTemplates(): Promise<void> {
    try {
      const companyId = await this.companyContext.requireCompanyIdOnce();
      await this.emailTemplateService.ensureDefaults(companyId);
      this.emailTemplateDefinitions.list(companyId).subscribe(templates => this.designedEmailTemplates.set(templates));
      this.emailTemplateService.list(companyId).subscribe(templates => {
        this.emailTemplates.set(templates);
        if (!this.selectedEmailTemplate() && templates.length) this.selectEmailTemplate(templates[0]);
      });
      collectionData(collection(this.db, `companies/${companyId}/templates`), { idField: 'id' }).subscribe({
        next: templates => {
          this.templates.set((templates as CompanyTemplate[]).map(template => this.toTemplateCard(companyId, template)));
          this.loading.set(false);
          this.error.set(null);
        },
        error: err => {
          console.error('Failed to load company templates', err);
          this.error.set('Unable to load templates.');
          this.loading.set(false);
        }
      });
    } catch (err: any) {
      await this.router.navigate([err?.message === 'Not authenticated' ? '/login' : '/register']);
    }
  }

  private toTemplateCard(companyId: string, template: CompanyTemplate): TemplateCard {
    const type = template.type as TemplateType;
    const name = template.name || (type === 'letter' ? 'Letter Template' : 'Invoice Template');
    return {
      ...template,
      companyId: template.companyId || companyId,
      name,
      type,
      category: type === 'letter' ? 'Letter' : 'Invoice',
      description: `${template.fileName || name} • ${this.formatLabels[normalizeTemplateFormat(template)]} • stored at ${template.bodyStoragePath || template.storagePath}.`,
      fileUrl: template.bodyStoragePath || template.storagePath,
      active: !template.archived,
      accent: type === 'letter' ? 'letter' : 'invoice'
    };
  }
}
