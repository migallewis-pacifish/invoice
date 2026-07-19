import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { JsonPipe, NgFor, NgIf } from '@angular/common';
import { WorkspaceShellComponent } from '../../components/workspace-shell/workspace-shell.component';
import { CompanyContextService } from '../../services/company-context.service';
import { EmailElement, EmailSection, EmailSelection, EmailTemplateDefinition, EmailTemplateType } from '../../models/email-template-designer.model';
import { EmailTemplatePaletteComponent } from './components/email-template-palette/email-template-palette.component';
import { EmailTemplateCanvasComponent } from './components/email-template-canvas/email-template-canvas.component';
import { EmailTemplateInspectorComponent } from './components/email-template-inspector/email-template-inspector.component';
import { EmailTemplatePreviewComponent } from './components/email-template-preview/email-template-preview.component';
import { EmailTemplateBuilderService } from './services/email-template-builder.service';
import { EmailTemplatePreviewDataService } from './services/email-template-preview-data.service';
@Component({ selector: 'app-email-template-designer', standalone: true, imports: [FormsModule, RouterLink, JsonPipe, NgFor, NgIf, WorkspaceShellComponent, EmailTemplatePaletteComponent, EmailTemplateCanvasComponent, EmailTemplateInspectorComponent, EmailTemplatePreviewComponent], templateUrl: './email-template-designer.component.html', styleUrl: './email-template-designer.component.scss' })
export class EmailTemplateDesignerComponent implements OnInit {
  private ctx = inject(CompanyContextService); private builder = inject(EmailTemplateBuilderService); private previewData = inject(EmailTemplatePreviewDataService); private router = inject(Router);
  template: EmailTemplateDefinition = { schemaVersion: 1, companyId: '', name: 'New email template', subject: 'Invoice {{invoice.number}} from {{company.name}}', type: 'invoice', sections: [] };
  types: { label: string; value: EmailTemplateType }[] = [{label:'Invoice',value:'invoice'},{label:'Payment reminder',value:'payment-reminder'},{label:'General',value:'general'}]; selection: EmailSelection = null; previewOpen=false; previewWidth:'desktop'|'mobile'='desktop'; generatedHtml=''; savedJson='';
  async ngOnInit(){ this.template.companyId = await this.ctx.requireCompanyIdOnce(); this.regenerate(); }
  get selectedSection(): EmailSection|undefined { return this.selection?.kind==='section' ? this.template.sections.find(s=>s.id===this.selection?.sectionId) : undefined; }
  get selectedElement(): EmailElement|undefined { const sel=this.selection; if(sel?.kind!=='element') return undefined; const s=this.template.sections.find(x=>x.id===sel.sectionId); return s?.columns.find(c=>c.id===sel.columnId)?.elements.find(e=>e.id===sel.elementId); }
  insertVariable(token: string){ const el=this.selectedElement; if(el?.type==='text') el.content += ` ${token}`; else this.template.subject += ` ${token}`; this.regenerate(); }
  changed(){ this.regenerate(); }
  clear(){ this.template.sections=[]; this.selection=null; this.regenerate(); }
  save(){ this.template.updatedAt = new Date().toISOString(); this.savedJson = JSON.stringify(this.template,null,2); this.regenerate(); }
  preview(){ this.generatedHtml = this.builder.buildHtml(this.template, v => this.previewData.renderTokens(v)); this.previewOpen=true; }
  duplicateSelected(){ const sel=this.selection; if(sel?.kind==='section'){ const i=this.template.sections.findIndex(s=>s.id===sel.sectionId); this.template.sections.splice(i+1,0,this.builder.duplicateSection(this.template.sections[i])); } else if(sel?.kind==='element'){ const c=this.template.sections.find(s=>s.id===sel.sectionId)?.columns.find(c=>c.id===sel.columnId); const i=c?.elements.findIndex(e=>e.id===sel.elementId) ?? -1; if(c && i>-1) c.elements.splice(i+1,0,this.builder.duplicateElement(c.elements[i])); } this.regenerate(); }
  deleteSelected(){ const sel=this.selection; if(sel?.kind==='section') this.template.sections=this.template.sections.filter(s=>s.id!==sel.sectionId); else if(sel?.kind==='element'){ const c=this.template.sections.find(s=>s.id===sel.sectionId)?.columns.find(c=>c.id===sel.columnId); if(c) c.elements=c.elements.filter(e=>e.id!==sel.elementId); } this.selection=null; this.regenerate(); }
  back(){ this.router.navigate(['/templates']); }
  private regenerate(){ this.generatedHtml = this.builder.buildHtml(this.template); }
}
