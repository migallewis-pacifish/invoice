import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgFor, NgIf } from '@angular/common';
import { WorkspaceShellComponent } from '../../components/workspace-shell/workspace-shell.component';
import { CompanyContextService } from '../../services/company-context.service';
import { EmailColumn, EmailElement, EmailSection, EmailSelection, EmailTemplateDefinition, EmailTemplateType } from '../../models/email-template-designer.model';
import { EmailTemplatePaletteComponent } from './components/email-template-palette/email-template-palette.component';
import { EmailTemplateCanvasComponent } from './components/email-template-canvas/email-template-canvas.component';
import { EmailTemplateInspectorComponent } from './components/email-template-inspector/email-template-inspector.component';
import { EmailTemplateBuilderService } from './services/email-template-builder.service';
import { EmailTemplatePreviewDataService } from './services/email-template-preview-data.service';
import { EmailTemplateDefinitionService } from './services/email-template-definition.service';
import { firstValueFrom, take } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

type WizardStep = 'choose' | 'design' | 'preview';
type StarterEmailTemplate = Omit<EmailTemplateDefinition, 'companyId'> & { description: string; accent: string; audience: string };

@Component({ selector: 'app-email-template-designer', standalone: true, imports: [FormsModule, NgFor, NgIf, WorkspaceShellComponent, EmailTemplatePaletteComponent, EmailTemplateCanvasComponent, EmailTemplateInspectorComponent], templateUrl: './email-template-designer.component.html', styleUrl: './email-template-designer.component.scss' })
export class EmailTemplateDesignerComponent implements OnInit {
  private ctx = inject(CompanyContextService); private builder = inject(EmailTemplateBuilderService); private previewData = inject(EmailTemplatePreviewDataService); private router = inject(Router); private route = inject(ActivatedRoute); private definitions = inject(EmailTemplateDefinitionService); private sanitizer = inject(DomSanitizer);
  template: EmailTemplateDefinition = { schemaVersion: 1, companyId: '', name: 'New email template', subject: 'Invoice {{invoice.number}} from {{company.name}}', type: 'invoice', sections: [] };
  types: { label: string; value: EmailTemplateType }[] = [{label:'Invoice',value:'invoice'},{label:'Payment reminder',value:'payment-reminder'},{label:'General',value:'general'}];
  steps: { label: string; value: WizardStep }[] = [{ label: 'Select template', value: 'choose' }, { label: 'Design', value: 'design' }, { label: 'Review', value: 'preview' }];
  currentStep: WizardStep = 'choose'; selectedStarterId = ''; selection: EmailSelection = null; previewWidth:'desktop'|'mobile'='desktop'; generatedHtml=''; reviewHtml: SafeHtml = ''; savedJson='';
  readonly starterTemplates = this.createStarterTemplates();
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
    if (!this.route.snapshot.paramMap.get('templateId')) await this.router.navigate(['/email-templates/designer', id], { replaceUrl: true });
  }
  goTo(step: WizardStep){ this.currentStep = step; if(step === 'preview') this.regenerate(true); }
  createNew(){ this.template = { schemaVersion: 1, companyId: this.template.companyId, name: 'New email template', subject: 'Invoice {{invoice.number}} from {{company.name}}', type: 'invoice', sections: [] }; this.selectedStarterId=''; this.selection=null; this.savedJson=''; this.currentStep='design'; this.regenerate(); }
  useStarter(starter: StarterEmailTemplate){ this.template = { ...structuredClone(starter), companyId: this.template.companyId, id: undefined, createdAt: undefined, updatedAt: undefined }; this.selectedStarterId = starter.id ?? ''; this.selection=null; this.savedJson=''; this.currentStep='design'; this.regenerate(); }
  duplicateSelected(){ const sel=this.selection; if(sel?.kind==='section'){ const i=this.template.sections.findIndex(s=>s.id===sel.sectionId); this.template.sections.splice(i+1,0,this.builder.duplicateSection(this.template.sections[i])); } else if(sel?.kind==='element'){ const c=this.template.sections.find(s=>s.id===sel.sectionId)?.columns.find(c=>c.id===sel.columnId); const i=c?.elements.findIndex(e=>e.id===sel.elementId) ?? -1; if(c && i>-1) c.elements.splice(i+1,0,this.builder.duplicateElement(c.elements[i])); } this.regenerate(); }
  deleteSelected(){ const sel=this.selection; if(sel?.kind==='section') this.template.sections=this.template.sections.filter(s=>s.id!==sel.sectionId); else if(sel?.kind==='element'){ const c=this.template.sections.find(s=>s.id===sel.sectionId)?.columns.find(c=>c.id===sel.columnId); if(c) c.elements=c.elements.filter(e=>e.id!==sel.elementId); } this.selection=null; this.regenerate(); }

  private createStarterTemplates(): StarterEmailTemplate[] {
    const section = (elements: EmailElement[], backgroundColor = '#ffffff', paddingTop = 24, paddingBottom = 24): EmailSection => ({ id: crypto.randomUUID(), type: 'layout', columnWidths: [100], styles: { backgroundColor, contentWidth: 600, columnGap: 0, paddingTop, paddingRight: 28, paddingBottom, paddingLeft: 28 }, columns: [{ id: crypto.randomUUID(), styles: this.builder.defaultColumnStyles(), elements }] });
    const text = (content: string, fontSize = 16, fontWeight = '400', color = '#071f4d', textAlign: 'left'|'center'|'right' = 'left', backgroundColor = '#ffffff'): EmailElement => ({ id: crypto.randomUUID(), type: 'text', content, styles: { fontSize, fontWeight, fontStyle: 'normal', textAlign, color, backgroundColor, lineHeight: 1.5, paddingTop: 8, paddingRight: 8, paddingBottom: 8, paddingLeft: 8 } });
    const spacer = (height: number): EmailElement => ({ id: crypto.randomUUID(), type: 'spacer', height });
    const tpl = (id: string, type: EmailTemplateType, name: string, description: string, subject: string, accent: string, audience: string, heading: string, body: string, cta: string): StarterEmailTemplate => ({ schemaVersion: 1, id, type, name, description, subject, accent, audience, sections: [section([text(heading, 26, '700', '#ffffff', 'left', accent), text(body), spacer(12), text(cta, 16, '700', accent)], accent, 26, 18), section([text('Thanks,\n{{company.name}}', 15, '600')], '#f8fbff', 18, 22)] });
    return [
      tpl('invoice-polished', 'invoice', 'Polished invoice', 'A confident invoice delivery email with clear payment details.', 'Invoice {{invoice.number}} is ready from {{company.name}}', '#2563eb', 'Professional clients', 'Invoice {{invoice.number}} is ready', 'Hi {{client.name}},\n\nYour invoice from {{company.name}} is attached for review. The current total is {{invoice.total}} and payment is due by {{invoice.dueDate}}.\n\nPlease include reference {{invoice.number}} with your payment.', 'Review the attached invoice and let us know if anything needs attention.'),
      tpl('invoice-friendly', 'invoice', 'Friendly handoff', 'A warmer invoice email for ongoing relationships.', 'Your {{company.name}} invoice: {{invoice.number}}', '#0f766e', 'Repeat customers', 'A quick invoice note', 'Hi {{client.name}},\n\nThanks again for working with us. We have attached invoice {{invoice.number}} for {{invoice.total}}. It is due on {{invoice.dueDate}}.\n\nWe appreciate your prompt payment.', 'Have questions? Reply to this email and we will help.'),
      tpl('invoice-premium', 'invoice', 'Premium statement', 'A concise, executive-style invoice message.', '{{company.name}} invoice {{invoice.number}}', '#111827', 'Enterprise contacts', 'Invoice summary', 'Hello {{client.name}},\n\nAttached is invoice {{invoice.number}} for {{invoice.total}}. Payment is scheduled for {{invoice.dueDate}}.\n\nUse invoice number {{invoice.number}} as the payment reference.', 'Thank you for your continued partnership.'),
      tpl('reminder-gentle', 'payment-reminder', 'Gentle reminder', 'A low-pressure reminder before or near the due date.', 'Friendly reminder: invoice {{invoice.number}}', '#7c3aed', 'Approachable follow-ups', 'Friendly payment reminder', 'Hi {{client.name}},\n\nThis is a quick reminder that invoice {{invoice.number}} for {{invoice.total}} is due on {{invoice.dueDate}}.\n\nIf payment is already arranged, thank you and please disregard this note.', 'We are happy to help if you need anything from us.'),
      tpl('reminder-action', 'payment-reminder', 'Action-focused reminder', 'A direct reminder with the payment reference front and center.', 'Action requested for invoice {{invoice.number}}', '#ea580c', 'Busy accounts teams', 'Payment action requested', 'Hello {{client.name}},\n\nInvoice {{invoice.number}} remains open with a balance of {{invoice.total}}. The due date is {{invoice.dueDate}}.\n\nPlease use {{invoice.number}} as the payment reference.', 'Please confirm once payment has been scheduled.'),
      tpl('reminder-overdue', 'payment-reminder', 'Overdue follow-up', 'A professional follow-up for invoices past due.', 'Overdue invoice {{invoice.number}} from {{company.name}}', '#dc2626', 'Overdue accounts', 'Invoice now overdue', 'Hi {{client.name}},\n\nOur records show invoice {{invoice.number}} for {{invoice.total}} was due on {{invoice.dueDate}} and still needs attention.\n\nPlease arrange payment or let us know if there is an issue.', 'Reply with an expected payment date so we can update our records.'),
      tpl('general-welcome', 'general', 'Modern welcome', 'A polished welcome or onboarding email.', 'Welcome from {{company.name}}', '#0891b2', 'New relationships', 'Welcome to {{company.name}}', 'Hi {{client.name}},\n\nWe are excited to work with you. This email confirms that your details are set up with {{company.name}}.\n\nWe will keep communication clear, timely, and easy to action.', 'Reply any time if you need support from our team.'),
      tpl('general-update', 'general', 'Project update', 'A clean update template for status notes.', 'Update from {{company.name}}', '#4f46e5', 'Project stakeholders', 'Here is the latest update', 'Hello {{client.name}},\n\nWe wanted to share a quick update from {{company.name}}. The key details are listed here so everything is easy to track.\n\nNext step: add your action item or summary.', 'Thanks for reviewing — we will keep you posted.'),
      tpl('general-thanks', 'general', 'Thank-you note', 'A simple gratitude email with a modern finish.', 'Thank you from {{company.name}}', '#16a34a', 'Client appreciation', 'Thank you', 'Hi {{client.name}},\n\nThank you for choosing {{company.name}}. We appreciate your trust and the opportunity to support your work.\n\nPlease keep this message for your records.', 'We look forward to working with you again.')
    ];
  }
  private regenerate(withSampleData = false){
    this.generatedHtml = this.builder.buildHtml(this.template, withSampleData ? value => this.previewData.renderTokens(value) : undefined);
    this.reviewHtml = this.sanitizer.bypassSecurityTrustHtml(this.generatedHtml);
  }
}
