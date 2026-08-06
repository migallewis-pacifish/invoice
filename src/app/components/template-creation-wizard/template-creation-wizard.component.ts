import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { UploadTemplateComponent } from '../../pages/upload-template/upload-template.component';
import { CompanyTemplateFormat } from '../../models/invoice.model';
import { CURRENT_AUTH_USER } from '../../services/company-context.service';
import { TemplateService } from '../../services/template.service';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { firstValueFrom, take } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { applyStarterPalette, createStarterEmailTemplates, StarterTemplate } from '../template-designer/template-starter-catalog';
import { TemplateDesignerComponent } from '../template-designer/template-designer.component';
import { TemplateColourSelectorComponent, TemplatePalette } from '../template-colour-selector/template-colour-selector.component';
import { TemplateSelectionLayoutComponent } from '../template-selection-layout/template-selection-layout.component';
import { EmailTemplateBuilderService } from '../template-designer/services/email-template-builder.service';
import { EmailTemplatePreviewDataService } from '../template-designer/services/email-template-preview-data.service';
import { DocumentTemplatePreviewService } from '../../services/document-template-preview.service';

export type TemplateCreationType = 'invoice' | 'letter' | 'email';
export type TemplateCreationFormat = Extract<CompanyTemplateFormat, 'docx' | 'freemarker-html'>;
type WizardStep = 'type' | 'format' | 'configure';

export interface TemplateCreationWizardData {
  initialType?: TemplateCreationType;
}

export interface FreemarkerStarterTemplate {
  id: string;
  name: string;
  description: string;
  accent: string;
  path: string;
}

const FREEMARKER_STARTER_IDS = ['azure-ledger', 'midnight-teal', 'sage-studio', 'coral-sidebar', 'monochrome-grid', 'violet-gradient', 'tricolour-sidebar'];
const FREEMARKER_LETTER_STARTER_IDS = ['classic-formal', 'modern-sidebar', 'editorial-centred', 'compact-business', 'window-envelope', 'executive-banner'];

interface StarterPaletteConfig {
  defaults: TemplatePalette;
  sourceColors: [string[], string[], string[]];
}

const STARTER_PALETTES: Record<string, StarterPaletteConfig> = {
  'azure-ledger': { defaults: ['#3478d4', '#245ca8', '#c9dcf7'], sourceColors: [['#3478d4'], ['#245ca8'], ['#c9dcf7']] },
  'midnight-teal': { defaults: ['#062f43', '#0e6174', '#16a9b8'], sourceColors: [['#062f43', '#063c50'], ['#0e6174', '#1993a3'], ['#16a9b8', '#18a4b3']] },
  'sage-studio': { defaults: ['#637f70', '#8b664a', '#9caf9f'], sourceColors: [['#637f70', '#647e70'], ['#8b664a'], ['#9caf9f']] },
  'coral-sidebar': { defaults: ['#18324b', '#ff6b5d', '#ff9c93'], sourceColors: [['#18324b'], ['#ff6b5d', '#ff6255'], ['#ff9c93', '#ff8b80']] },
  'monochrome-grid': { defaults: ['#111111', '#555555', '#dddddd'], sourceColors: [['#111'], ['#555'], ['#ddd']] },
  'violet-gradient': { defaults: ['#302561', '#5b3cc4', '#8b5cf6'], sourceColors: [['#302561', '#292344'], ['#5b3cc4', '#5135aa'], ['#8b5cf6', '#9f7aea']] },
  'tricolour-sidebar': { defaults: ['#3a666d', '#2a7a87', '#71c2a7'], sourceColors: [[], [], []] },
  'classic-formal': letterPalette(),
  'modern-sidebar': letterPalette(),
  'editorial-centred': letterPalette(),
  'compact-business': letterPalette(),
  'window-envelope': letterPalette(),
  'executive-banner': letterPalette()
};

export const FREEMARKER_INVOICE_TEMPLATES: FreemarkerStarterTemplate[] = [
  starter('invoice', 'azure-ledger', 'Azure Ledger', 'A crisp blue header with a classic ledger layout.', '#3478d4'),
  starter('invoice', 'midnight-teal', 'Midnight Teal', 'A dark, polished invoice with teal highlights.', '#1b9c96'),
  starter('invoice', 'sage-studio', 'Sage Studio', 'A calm editorial design with soft green details.', '#779b78'),
  starter('invoice', 'coral-sidebar', 'Coral Sidebar', 'A warm, modern layout with a bold side panel.', '#ed765f'),
  starter('invoice', 'monochrome-grid', 'Monochrome Grid', 'A minimal black-and-white professional layout.', '#202020'),
  starter('invoice', 'violet-gradient', 'Violet Gradient', 'A vibrant contemporary invoice with violet accents.', '#7357d9'),
  starter('invoice', 'tricolour-sidebar', 'Tricolour Sidebar', 'A structured sidebar design with a custom three-colour gradient.', 'linear-gradient(#3a666d, #2a7a87, #71c2a7)')
];

export const FREEMARKER_LETTER_TEMPLATES: FreemarkerStarterTemplate[] = [
  starter('letter', 'classic-formal', 'Classic Formal', 'A traditional letter with a formal address block.', '#20242a'),
  starter('letter', 'modern-sidebar', 'Modern Sidebar', 'A narrow sender rail leaves a clear reading column.', '#252a31'),
  starter('letter', 'editorial-centred', 'Editorial Centred', 'A spacious centred masthead and editorial body.', '#686f78'),
  starter('letter', 'compact-business', 'Compact Business', 'A structured metadata grid for concise correspondence.', '#1f2933'),
  starter('letter', 'window-envelope', 'Window Envelope', 'A recipient-first layout designed for window envelopes.', '#6e7781'),
  starter('letter', 'executive-banner', 'Executive Banner', 'A prominent masthead with a split executive header.', '#252930')
];

function starter(type: 'invoice' | 'letter', id: string, name: string, description: string, accent: string): FreemarkerStarterTemplate {
  const ids = type === 'invoice' ? FREEMARKER_STARTER_IDS : FREEMARKER_LETTER_STARTER_IDS;
  const index = ids.indexOf(id) + 1;
  return { id, name, description, accent, path: `/templates/${type}s/${String(index).padStart(2, '0')}-${id}.ftl` };
}

function letterPalette(): StarterPaletteConfig {
  return { defaults: ['#252a31', '#747b84', '#f0f1f2'], sourceColors: [['#20242a', '#252a31', '#282828', '#1f2933', '#24292f', '#252930'], ['#686f78', '#747b84', '#777', '#69727d', '#6e7781', '#737a84'], ['#eceef0', '#f0f1f2', '#eeeeec', '#edf0f2', '#f0f2f4', '#eef0f2']] };
}

@Component({
  selector: 'app-template-creation-wizard',
  standalone: true,
  imports: [CommonModule, UploadTemplateComponent, TemplateColourSelectorComponent, TemplateSelectionLayoutComponent],
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
  private readonly emailBuilder = inject(EmailTemplateBuilderService);
  private readonly emailPreviewData = inject(EmailTemplatePreviewDataService);
  private readonly documentPreview = inject(DocumentTemplatePreviewService);
  private readonly dialogData = inject<TemplateCreationWizardData>(DIALOG_DATA, { optional: true });

  readonly typeLocked = !!this.dialogData?.initialType;
  readonly step = signal<WizardStep>(this.dialogData?.initialType === 'email' ? 'configure' : (this.typeLocked ? 'format' : 'type'));
  readonly creationType = signal<TemplateCreationType | null>(this.dialogData?.initialType ?? null);
  readonly format = signal<TemplateCreationFormat | null>(null);
  readonly starters = createStarterEmailTemplates();
  readonly freemarkerStarters = computed(() => this.creationType() === 'letter' ? FREEMARKER_LETTER_TEMPLATES : FREEMARKER_INVOICE_TEMPLATES);
  readonly selectedFreemarker = signal<FreemarkerStarterTemplate | null>(null);
  readonly freemarkerPreview = signal<SafeResourceUrl | null>(null);
  readonly freemarkerBusy = signal(false);
  readonly freemarkerError = signal<string | null>(null);
  readonly templateName = signal('');
  readonly selectedEmailStarter = signal<StarterTemplate | null>(null);
  readonly emailStarterPreview = signal('');
  readonly emailPalettes = signal<Record<string, TemplatePalette>>(Object.fromEntries(
    this.starters.map(starter => [starter.id, [...starter.palette] as TemplatePalette])
  ));
  readonly starterPalettes = signal<Record<string, TemplatePalette>>(Object.fromEntries(
    Object.entries(STARTER_PALETTES).map(([id, config]) => [id, [...config.defaults] as TemplatePalette])
  ));
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
    if (this.typeLocked) {
      this.close();
      return;
    }
    this.step.set('type');
  }

  async selectFreemarker(starter: FreemarkerStarterTemplate): Promise<void> {
    this.selectedFreemarker.set(starter);
    this.templateName.set(starter.name);
    this.freemarkerError.set(null);
    this.releasePreview();
    try {
      const source = this.customizeStarterSource(await this.fetchStarter(starter), starter);
      const themedSource = source.replace(
        /\$\{\(theme\.sidebarColor([123])(?:\)!|!)'[^']+'(?:\))?(?:\?html)?}/g,
        (_match, index) => this.paletteFor(starter)[Number(index) - 1] ?? '#2a7a87'
      );
      const preview = this.documentPreview.buildHtml(themedSource);
      this.previewObjectUrl = URL.createObjectURL(new Blob([preview], { type: 'text/html' }));
      this.freemarkerPreview.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.previewObjectUrl));
    } catch {
      this.freemarkerError.set('The template preview could not be loaded. Please try another template.');
    }
  }

  updateStarterPalette(colors: TemplatePalette): void {
    const selected = this.selectedFreemarker();
    if (!selected) return;
    this.starterPalettes.update(palettes => ({ ...palettes, [selected.id]: colors }));
    void this.selectFreemarker(selected);
  }

  async selectEmailStarter(starter: StarterTemplate): Promise<void> {
    this.selectedEmailStarter.set(starter);
    try {
      const response = await fetch(starter.sourcePath);
      if (!response.ok) throw new Error('Template not found');
      const source = this.applyEmailPalette(await response.text(), this.emailPaletteFor(starter));
      this.emailStarterPreview.set(this.emailPreviewData.renderTokens(source.replace(/\$\{\s*([a-zA-Z0-9_.]+)(?:\?html)?\s*}/g, '{{$1}}')));
    } catch {
      const themed = applyStarterPalette(starter, this.emailPaletteFor(starter));
      this.emailStarterPreview.set(this.emailBuilder.buildHtml({ ...themed, companyId: 'preview' }, value => this.emailPreviewData.renderTokens(value)));
    }
  }

  emailPaletteFor(starter: StarterTemplate): TemplatePalette {
    return this.emailPalettes()[starter.id!] ?? starter.palette;
  }

  updateEmailPalette(colors: TemplatePalette): void {
    const selected = this.selectedEmailStarter();
    if (!selected?.id) return;
    this.emailPalettes.update(palettes => ({ ...palettes, [selected.id!]: colors }));
    void this.selectEmailStarter(selected);
  }

  useSelectedEmailStarter(): void {
    const starter = this.selectedEmailStarter();
    if (starter) this.chooseStarter(starter);
  }

  paletteFor(starter: FreemarkerStarterTemplate): TemplatePalette {
    return this.starterPalettes()[starter.id] ?? STARTER_PALETTES[starter.id]?.defaults ?? ['#000000', '#666666', '#cccccc'];
  }

  async useSelectedFreemarker(): Promise<void> {
    const starter = this.selectedFreemarker();
    const templateName = this.templateName().trim();
    if (!starter || !templateName || this.freemarkerBusy()) return;
    this.freemarkerBusy.set(true);
    this.freemarkerError.set(null);
    try {
      const user = await firstValueFrom(this.authUser$.pipe(take(1)));
      if (!user) throw new Error('Sign in to add a template.');
      const profile = await firstValueFrom(docData(doc(this.db, `users/${user.uid}`)).pipe(take(1))) as any;
      if (!profile?.companyId) throw new Error('No company is linked to your account.');
      const source = this.customizeStarterSource(await this.fetchStarter(starter), starter);
      const palette = this.paletteFor(starter);
      const file = new File([source], `${starter.id}.html`, { type: 'text/html' });
      const result = await this.templateService.upload(profile.companyId, file, this.documentType(), undefined, {
        format: 'freemarker-html',
        name: templateName,
        sourceKind: 'ready-made',
        starterTemplateId: starter.id,
        theme: { primary: palette[0], secondary: palette[1], accent: palette[2] }
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

  private customizeStarterSource(source: string, starter: FreemarkerStarterTemplate): string {
    const palette = this.paletteFor(starter);
    if (starter.id === 'tricolour-sidebar') {
      return source.replace(
        /\$\{\(theme\.sidebarColor([123])(?:\)!|!)'[^']+'(?:\))?(?:\?html)?}/g,
        (expression, index) => expression.replace(/'[^']+'/, `'${palette[Number(index) - 1] ?? '#2a7a87'}'`)
      );
    }
    const config = STARTER_PALETTES[starter.id];
    if (!config) return source;
    if (starter.id === 'monochrome-grid') source = source.replace('border-top:5px solid #111', `border-top:5px solid ${palette[1]}`);
    return config.sourceColors.reduce((result, sourceColors, index) => sourceColors.reduce((updated, sourceColor) => {
      const exactCssColor = new RegExp(`${sourceColor}(?![0-9a-f])`, 'gi');
      return updated.replace(exactCssColor, () => palette[index] ?? config.defaults[index] ?? '#000000');
    }, result), source);
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

  chooseStarter(starter: StarterTemplate): void {
    this.dialogRef.close(null);
    const themed = applyStarterPalette(starter, this.emailPaletteFor(starter));
    queueMicrotask(() => this.openDesigner(starter.id, themed));
  }

  startBlank(): void {
    this.dialogRef.close(null);
    queueMicrotask(() => this.openDesigner());
  }

  private openDesigner(starterId?: string, starter?: StarterTemplate): void {
    this.dialog.open(TemplateDesignerComponent, {
      data: { dialogMode: true, starterId, starter },
      width: 'min(96vw, 1720px)',
      maxWidth: '1720px',
      maxHeight: '96vh',
      backdropClass: 'dlg-backdrop',
      panelClass: 'email-designer-dialog-panel'
    });
  }


  private applyEmailPalette(source: string, palette: TemplatePalette): string {
    return source
      .replace(/\$\{\(theme\.primary\)!'[^']+'}/g, palette[0])
      .replace(/\$\{\(theme\.secondary\)!'[^']+'}/g, palette[1])
      .replace(/\$\{\(theme\.accent\)!'[^']+'}/g, palette[2]);
  }
}
