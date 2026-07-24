import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgFor, NgIf, NgTemplateOutlet } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { WorkspaceShellComponent } from '../../components/workspace-shell/workspace-shell.component';
import { CompanyContextService } from '../../services/company-context.service';
import { EmailColumn, EmailElement, EmailSection, EmailSelection, EmailTemplateDefinition, EmailTemplateType } from '../../models/email-template-designer.model';
import { cloneStarterEmailTemplate, createStarterEmailTemplates, StarterEmailTemplate } from './email-template-starter-catalog';
import { EmailTemplatePaletteComponent } from './components/email-template-palette/email-template-palette.component';
import { EmailTemplateCanvasComponent } from './components/email-template-canvas/email-template-canvas.component';
import { EmailTemplateInspectorComponent } from './components/email-template-inspector/email-template-inspector.component';
import { EmailTemplateBuilderService } from './services/email-template-builder.service';
import { EmailTemplatePreviewDataService } from './services/email-template-preview-data.service';
import { EmailTemplateDefinitionService } from './services/email-template-definition.service';
import { firstValueFrom, take } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

type WizardStep = 'choose' | 'design' | 'preview';

@Component({ selector: 'app-email-template-designer', standalone: true, imports: [FormsModule, NgFor, NgIf, NgTemplateOutlet, WorkspaceShellComponent, EmailTemplatePaletteComponent, EmailTemplateCanvasComponent, EmailTemplateInspectorComponent], templateUrl: './email-template-designer.component.html', styleUrl: './email-template-designer.component.scss' })
export class EmailTemplateDesignerComponent implements OnInit {
  private ctx = inject(CompanyContextService); private builder = inject(EmailTemplateBuilderService); private previewData = inject(EmailTemplatePreviewDataService); private router = inject(Router); private route = inject(ActivatedRoute); private definitions = inject(EmailTemplateDefinitionService); private sanitizer = inject(DomSanitizer);
  private readonly dialogRef = inject<DialogRef<string>>(DialogRef, { optional: true });
  private readonly dialogData = inject(DIALOG_DATA, { optional: true }) as { dialogMode?: boolean } | null;
  readonly dialogMode = this.dialogData?.dialogMode === true;
  template: EmailTemplateDefinition = { schemaVersion: 1, companyId: '', name: 'New email template', subject: 'Invoice {{invoice.number}} from {{company.name}}', type: 'invoice', sections: [] };
  types: { label: string; value: EmailTemplateType }[] = [{label:'Invoice',value:'invoice'},{label:'Payment reminder',value:'payment-reminder'},{label:'General',value:'general'}];
  steps: { label: string; value: WizardStep }[] = [{ label: 'Select template', value: 'choose' }, { label: 'Design', value: 'design' }, { label: 'Review', value: 'preview' }];
  currentStep: WizardStep = 'choose'; selectedStarterId = ''; selection: EmailSelection = null; previewWidth:'desktop'|'mobile'='desktop'; generatedHtml=''; reviewHtml: SafeHtml = ''; savedJson='';
  readonly starterTemplates = createStarterEmailTemplates();
  async ngOnInit(){
    const companyId = await this.ctx.requireCompanyIdOnce();
    const company = await firstValueFrom(this.ctx.currentCompany$().pipe(take(1)));
    this.previewData.useCurrency(company?.currency);
    const templateId = this.route.snapshot.paramMap.get('templateId');
    if (templateId) {
      const stored = await firstValueFrom(this.definitions.get(companyId, templateId));
      if (stored) {
        this.template = stored;
        this.currentStep = 'design';
      }
    }
    this.template.companyId = companyId;
    this.regenerate();
  }
  get selectedSection(): EmailSection|undefined { return this.selection?.kind==='section' ? this.template.sections.find(s=>s.id===this.selection?.sectionId) : undefined; }
  get selectedColumn(): EmailColumn|undefined { const sel=this.selection; if(sel?.kind!=='column') return undefined; return this.template.sections.find(s=>s.id===sel.sectionId)?.columns.find(c=>c.id===sel.columnId); }
  get selectedElement(): EmailElement|undefined { const sel=this.selection; if(sel?.kind!=='element') return undefined; const s=this.template.sections.find(x=>x.id===sel.sectionId); return s?.columns.find(c=>c.id===sel.columnId)?.elements.find(e=>e.id===sel.elementId); }
  templatesFor(type: EmailTemplateType): StarterEmailTemplate[] { return this.starterTemplates.filter(t => t.type === type); }
  changed(){ this.regenerate(this.currentStep === 'preview'); }
  async save(){
    const id = await this.definitions.save(this.template.companyId, this.template);
    this.template.id = id;
    this.savedJson = JSON.stringify(this.template,null,2);
    this.regenerate();
    if (this.dialogMode) {
      this.dialogRef?.close(id);
    } else if (!this.route.snapshot.paramMap.get('templateId')) {
      await this.router.navigate(['/email-templates/designer', id], { replaceUrl: true });
    }
  }
  closeDialog(){ this.dialogRef?.close(); }
  goTo(step: WizardStep){ this.currentStep = step; if(step === 'preview') this.regenerate(true); }
  createNew(){ this.template = { schemaVersion: 1, companyId: this.template.companyId, name: 'New email template', subject: 'Invoice {{invoice.number}} from {{company.name}}', type: 'invoice', sections: [] }; this.selectedStarterId=''; this.selection=null; this.savedJson=''; this.currentStep='design'; this.regenerate(); }
  useStarter(starter: StarterEmailTemplate){ this.template = cloneStarterEmailTemplate(starter, this.template.companyId); this.selectedStarterId = starter.id ?? ''; this.selection=null; this.savedJson=''; this.currentStep='design'; this.regenerate(); }
  duplicateSelected(){ const sel=this.selection; if(sel?.kind==='section'){ const i=this.template.sections.findIndex(s=>s.id===sel.sectionId); this.template.sections.splice(i+1,0,this.builder.duplicateSection(this.template.sections[i])); } else if(sel?.kind==='element'){ const c=this.template.sections.find(s=>s.id===sel.sectionId)?.columns.find(c=>c.id===sel.columnId); const i=c?.elements.findIndex(e=>e.id===sel.elementId) ?? -1; if(c && i>-1) c.elements.splice(i+1,0,this.builder.duplicateElement(c.elements[i])); } this.regenerate(); }
  deleteSelected(){ const sel=this.selection; if(sel?.kind==='section') this.template.sections=this.template.sections.filter(s=>s.id!==sel.sectionId); else if(sel?.kind==='element'){ const c=this.template.sections.find(s=>s.id===sel.sectionId)?.columns.find(c=>c.id===sel.columnId); if(c) c.elements=c.elements.filter(e=>e.id!==sel.elementId); } this.selection=null; this.regenerate(); }

  private regenerate(withSampleData = false){
    this.generatedHtml = this.builder.buildHtml(this.template, withSampleData ? value => this.previewData.renderTokens(value) : undefined);
    this.reviewHtml = this.sanitizer.bypassSecurityTrustHtml(this.generatedHtml);
  }
}
