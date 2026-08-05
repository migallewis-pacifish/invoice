import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
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
import { CompanyEmailTemplate, EMAIL_TEMPLATE_VARIABLE_LABELS, EMAIL_TEMPLATE_VARIABLES } from '../../models/company-email-template.model';
import { EmailTemplateService, validateEmailTemplate } from '../../services/email-template.service';
import { WorkspaceShellComponent } from '../../components/workspace-shell/workspace-shell.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { EmailTemplateDefinition, EmailTemplateScenario } from '../../models/email-template-designer.model';
import { EMAIL_TEMPLATE_SCENARIOS, EmailTemplateDefinitionService } from '../../components/template-designer/services/email-template-definition.service';
import { Dialog } from '@angular/cdk/dialog';
import { EmailTemplateBuilderService } from '../../components/template-designer/services/email-template-builder.service';
import { EmailTemplatePreviewDataService } from '../../components/template-designer/services/email-template-preview-data.service';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { TemplateCreationType, TemplateCreationWizardComponent } from '../../components/template-creation-wizard/template-creation-wizard.component';
import { DocumentTemplatePreviewService } from '../../services/document-template-preview.service';
import { NotificationService } from '../../services/notification.service';
import { RenameTemplateDialogComponent } from '../../components/rename-template-dialog/rename-template-dialog.component';

type TemplateType = 'invoice' | 'letter';
type TemplateTab = 'overview' | 'invoices' | 'letters' | 'emails';
type TemplateStatusFilter = 'active' | 'archived';

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

interface GalleryCardBase {
  id: string;
  name: string;
  description: string;
  badge: string;
  detail: string;
  defaults: string[];
  archived: boolean;
  viewAction: 'view' | 'download';
}

type GalleryCard =
  | (GalleryCardBase & { kind: 'invoice' | 'letter'; source: TemplateCard })
  | (GalleryCardBase & { kind: 'email'; source: EmailTemplateDefinition });


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
  imports: [CommonModule, RouterLink, ReactiveFormsModule, NavBarComponent, WorkspaceTopbarComponent, WorkspaceShellComponent, EmptyStateComponent],
  templateUrl: './templates.component.html',
  styleUrl: './templates.component.scss'
})
export class TemplatesComponent implements OnDestroy {
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
  private documentPreview = inject(DocumentTemplatePreviewService);
  private notifications = inject(NotificationService);

  protected readonly activeTab = signal<TemplateTab>('overview');
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly templates = signal<TemplateCard[]>([]);
  protected readonly statusFilter = signal<TemplateStatusFilter>('active');
  protected readonly emailTemplates = signal<CompanyEmailTemplate[]>([]);
  protected readonly designedEmailTemplates = signal<EmailTemplateDefinition[]>([]);
  protected readonly previewEmailTemplate = signal<EmailTemplateDefinition | null>(null);
  protected readonly previewEmailHtml = signal<SafeHtml>('');
  protected readonly previewDocumentTemplate = signal<GalleryCard | null>(null);
  protected readonly previewDocumentUrl = signal<SafeResourceUrl | null>(null);
  protected readonly scenarios = EMAIL_TEMPLATE_SCENARIOS;
  protected readonly selectedEmailTemplate = signal<CompanyEmailTemplate | null>(null);
  protected readonly emailTemplateMessage = signal('');
  protected readonly variables = EMAIL_TEMPLATE_VARIABLES;
  protected readonly variableLabels = EMAIL_TEMPLATE_VARIABLE_LABELS;
  private documentPreviewObjectUrl: string | null = null;

  protected readonly emailTemplateForm = this.fb.nonNullable.group({
    subject: ['', [Validators.required]],
    body: ['', [Validators.required]]
  });

  constructor() {
    const requestedTab = this.route.snapshot.queryParamMap.get('tab');
    if (requestedTab === 'emails' || requestedTab === 'letters' || requestedTab === 'invoices') this.activeTab.set(requestedTab);
    if (requestedTab === 'gallery') this.activeTab.set('invoices');
    this.loadCompanyTemplates();
  }

  protected readonly documentTemplates = computed(() => {
    const type: TemplateType = this.activeTab() === 'letters' ? 'letter' : 'invoice';
    const archived = this.statusFilter() === 'archived';
    return this.templates().filter(template => template.type === type && !!template.archived === archived);
  });
  protected readonly filteredEmailTemplates = computed(() => {
    const archived = this.statusFilter() === 'archived';
    return this.designedEmailTemplates().filter(template => !!template.archived === archived);
  });
  protected readonly galleryCards = computed<GalleryCard[]>(() => {
    if (this.activeTab() === 'emails') {
      return this.filteredEmailTemplates().map(template => ({
        kind: 'email',
        id: template.id ?? template.name,
        name: template.name,
        description: template.subject,
        badge: template.type,
        detail: `${template.sections.length} section${template.sections.length === 1 ? '' : 's'}`,
        defaults: (template.defaultForScenarios ?? []).map(scenario => this.scenarioLabel(scenario)),
        archived: !!template.archived,
        viewAction: 'view',
        source: template
      }));
    }
    return this.documentTemplates().map(template => ({
      kind: template.type,
      id: template.id,
      name: template.name,
      description: template.description ?? template.fileName ?? template.name,
      badge: this.formatLabels[template.format || 'docx'] || template.format || 'Custom Word document',
      detail: '',
      defaults: [],
      archived: !!template.archived,
      viewAction: normalizeTemplateFormat(template) === 'docx' ? 'download' : 'view',
      source: template
    }));
  });
  protected readonly invoiceTemplateCount = computed(() => this.templates().filter(template => template.type === 'invoice' && !template.archived).length);
  protected readonly letterTemplateCount = computed(() => this.templates().filter(template => template.type === 'letter' && !template.archived).length);
  protected readonly emailTemplateCount = computed(() => this.designedEmailTemplates().filter(template => !template.archived).length);
  protected readonly formatLabels: Record<string, string> = { docx: 'Custom Word document', 'freemarker-html': 'Ready-made design', 'pdf-mapped': 'Mapped PDF' };
  protected readonly totalTemplateCount = computed(() => this.templates().filter(template => template.active && !template.archived).length + this.emailTemplateCount());

  protected setTab(tab: TemplateTab): void {
    this.activeTab.set(tab);
  }

  protected openUploadFlow(): void {
    this.openCreationWizard(this.activeTab() === 'letters' ? 'letter' : 'invoice');
  }

  protected toggleStatusFilter(): void {
    this.statusFilter.update(current => current === 'active' ? 'archived' : 'active');
  }

  protected galleryTypeLabel(): string {
    return this.activeTab() === 'emails' ? 'Email' : this.activeTab() === 'letters' ? 'Letter' : 'Invoice';
  }

  protected galleryAddDescription(): string {
    return this.activeTab() === 'emails'
      ? 'Choose a ready-made design or start from scratch.'
      : 'Upload a custom Word document or choose a ready-made design.';
  }

  protected addGalleryTemplate(): void {
    if (this.activeTab() === 'emails') this.newEmailTemplate();
    else this.openUploadFlow();
  }

  protected renameGalleryTemplate(template: GalleryCard): void {
    const ref = this.dialog.open<string | null>(RenameTemplateDialogComponent, {
      data: { name: template.name },
      width: 'min(92vw, 420px)',
      backdropClass: 'dlg-backdrop',
      panelClass: 'rename-template-dialog-panel'
    });
    ref.closed.subscribe(name => {
      if (name && name !== template.name) void this.applyTemplateRename(template, name);
    });
  }

  private async applyTemplateRename(template: GalleryCard, name: string): Promise<void> {
    try {
      const companyId = await this.companyContext.requireCompanyIdOnce();
      if (template.kind === 'email') {
        if (template.source.id) await this.emailTemplateDefinitions.rename(companyId, template.source.id, name);
      } else {
        await this.templateService.renameTemplate(companyId, template.source.id, name);
      }
    } catch (e: any) {
      const message = e?.message ?? 'Unable to rename template.';
      this.error.set(message);
      this.notifications.error(message, e);
    }
  }

  protected duplicateGalleryTemplate(template: GalleryCard): void {
    if (template.kind === 'email') void this.duplicateDesignedEmailTemplate(template.source);
    else void this.duplicateTemplate(template.source);
  }

  protected viewGalleryTemplate(template: GalleryCard): void {
    if (template.kind === 'email') this.previewDesignedEmailTemplate(template.source);
    else if (template.viewAction === 'download') void this.viewTemplate(template.source);
    else void this.previewDesignedDocumentTemplate(template);
  }

  protected openGalleryMenu(template: GalleryCard): void {
    if (template.kind === 'email') void this.openEmailMoreMenu(template.source);
    else void this.openMoreMenu(template.source);
  }

  protected async archiveGalleryTemplate(template: GalleryCard): Promise<void> {
    try {
      if (template.kind === 'email') {
        await this.archiveDesignedEmailTemplate(template.source);
        return;
      }
      const companyId = await this.companyContext.requireCompanyIdOnce();
      await this.templateService.archiveTemplate(companyId, template.source.id, !template.source.archived);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to update template archive status.');
    }
  }

  protected closeDocumentPreview(): void {
    this.previewDocumentTemplate.set(null);
    this.releaseDocumentPreview();
  }

  protected async previewDesignedDocumentTemplate(template: GalleryCard & { kind: 'invoice' | 'letter' }): Promise<void> {
    this.previewDocumentTemplate.set(template);
    this.releaseDocumentPreview();
    try {
      const source = await this.templateService.getTemplateSource(template.source.storagePath);
      console.log('previewDesignedDocumentTemplate source', source);
      const previewHtml = this.documentPreview.buildHtml(source);
      this.documentPreviewObjectUrl = URL.createObjectURL(new Blob([previewHtml], { type: 'text/html' }));
      this.previewDocumentUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.documentPreviewObjectUrl));
    } catch (e: any) {
      this.closeDocumentPreview();
      this.error.set(e?.message ?? 'Unable to preview template.');
    }
  }

  ngOnDestroy(): void {
    this.releaseDocumentPreview();
  }

  private releaseDocumentPreview(): void {
    if (this.documentPreviewObjectUrl) URL.revokeObjectURL(this.documentPreviewObjectUrl);
    this.documentPreviewObjectUrl = null;
    this.previewDocumentUrl.set(null);
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
    const action = window.prompt('Choose action: archive, default, duplicate, delete', template.archived ? 'archive' : 'default');
    if (!action) return;
    try {
      const companyId = await this.companyContext.requireCompanyIdOnce();
      switch (action.toLowerCase()) {
        case 'archive':
          await this.templateService.archiveTemplate(companyId, template.id, !template.archived);
          break;
        case 'default':
        case 'set default':
          await this.templateService.setDefaultTemplate(companyId, template.id, template.type);
          break;
        case 'duplicate':
        case 'copy':
          await this.templateService.duplicateTemplate(companyId, template);
          break;
        case 'delete':
          if (await this.notifications.confirm(`Delete ${template.name}? This action cannot be undone.`, 'Delete template')) {
            await this.templateService.deleteTemplate(companyId, template);
            this.notifications.success(`${template.name} was deleted.`);
          }
          break;
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to update template.');
      this.notifications.error(e?.message ?? 'Unable to update template.', e);
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

  protected previewDesignedEmailTemplate(template: EmailTemplateDefinition): void {
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

  protected async openEmailMoreMenu(template: EmailTemplateDefinition): Promise<void> {
    const action = window.prompt(
      `Choose action: ${template.archived ? 'restore' : 'archive'}, default, duplicate`,
      template.archived ? 'restore' : 'default'
    );
    if (!action) return;

    try {
      switch (action.toLowerCase()) {
        case 'archive':
        case 'restore':
          await this.archiveDesignedEmailTemplate(template);
          break;
        case 'duplicate':
        case 'copy':
          await this.duplicateDesignedEmailTemplate(template);
          break;
        case 'default':
        case 'set default': {
          const compatible = this.compatibleScenarios(template);
          const scenario = window.prompt(
            `Set as default for: ${compatible.map(item => `${item.label} (${item.value})`).join(', ')}`,
            compatible[0]?.value ?? ''
          ) as EmailTemplateScenario | null;
          if (scenario && compatible.some(item => item.value === scenario)) {
            await this.setDefaultEmailTemplate(template, scenario);
          }
          break;
        }
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to update email template.');
    }
  }

  protected scenarioLabel(scenario: EmailTemplateScenario): string {
    return this.scenarios.find(item => item.value === scenario)?.label ?? scenario;
  }

  protected compatibleScenarios(template: EmailTemplateDefinition): typeof EMAIL_TEMPLATE_SCENARIOS {
    return this.scenarios.filter(scenario => scenario.type === template.type);
  }

  protected newEmailTemplate(): void {
    this.openCreationWizard('email');
  }

  private openCreationWizard(initialType: TemplateCreationType): void {
    this.dialog.open(TemplateCreationWizardComponent, {
      data: { initialType },
      width: 'min(97vw, 1440px)',
      maxWidth: '1440px',
      maxHeight: '97vh',
      backdropClass: 'dlg-backdrop',
      panelClass: 'template-creation-wizard-panel'
    });
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
