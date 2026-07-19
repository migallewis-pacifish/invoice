import { Injectable, SecurityContext, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { EmailElement, EmailImageElement, EmailSection, EmailTemplateDefinition, EmailTextElement } from '../../../models/email-template-designer.model';

@Injectable({ providedIn: 'root' })
export class EmailTemplateBuilderService {
  private sanitizer = inject(DomSanitizer);
  newSection(widths: number[]): EmailSection { return { id: crypto.randomUUID(), type: 'layout', columnWidths: widths, styles: { backgroundColor: '#ffffff', contentWidth: 600, columnGap: 16, paddingTop: 24, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 }, columns: widths.map(() => ({ id: crypto.randomUUID(), elements: [] })) }; }
  newElement(type: string, variablePath?: string): EmailElement {
    const id = crypto.randomUUID();
    if (type === 'image') return { id, type: 'image', url: '', alt: '', widthPercent: 100, alignment: 'center', linkUrl: '', borderRadius: 0 };
    if (type === 'spacer') return { id, type: 'spacer', height: 32 };
    if (type === 'variable') return { id, type: 'variable', path: variablePath ?? 'invoice.number', token: `{{${variablePath ?? 'invoice.number'}}}` };
    return { id, type: 'text', content: 'Write your email text here.', styles: { fontSize: 16, fontWeight: '400', fontStyle: 'normal', textAlign: 'left', color: '#071f4d', backgroundColor: '#ffffff', lineHeight: 1.5, paddingTop: 8, paddingRight: 8, paddingBottom: 8, paddingLeft: 8 } };
  }
  duplicateSection(section: EmailSection): EmailSection { return { ...structuredClone(section), id: crypto.randomUUID(), columns: section.columns.map(c => ({ id: crypto.randomUUID(), elements: c.elements.map(e => ({ ...structuredClone(e), id: crypto.randomUUID() })) })) }; }
  duplicateElement(element: EmailElement): EmailElement { return { ...structuredClone(element), id: crypto.randomUUID() } as EmailElement; }
  buildHtml(template: EmailTemplateDefinition, renderTokens = (v: string) => v): string {
    const body = template.sections.map(s => this.sectionHtml(s, renderTokens)).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${this.escape(renderTokens(template.subject))}</title></head><body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;"><main style="max-width:600px;margin:0 auto;background:#fff;">${body}</main></body></html>`;
  }
  private sectionHtml(section: EmailSection, renderTokens: (v: string) => string): string {
    const s = section.styles;
    const cols = section.columns.map((c, i) => `<td style="width:${section.columnWidths[i]}%;vertical-align:top;padding:0 ${s.columnGap / 2}px;">${c.elements.map(e => this.elementHtml(e, renderTokens)).join('')}</td>`).join('');
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:${s.contentWidth}px;background:${this.safeCss(s.backgroundColor)};padding:${s.paddingTop}px ${s.paddingRight}px ${s.paddingBottom}px ${s.paddingLeft}px;"><tr>${cols}</tr></table>`;
  }
  private elementHtml(element: EmailElement, renderTokens: (v: string) => string): string {
    if (element.type === 'text') { const e = element as EmailTextElement; const c = this.escape(renderTokens(this.stripHtml(e.content))); const s = e.styles; return `<div style="font-size:${s.fontSize}px;font-weight:${s.fontWeight};font-style:${s.fontStyle};text-align:${s.textAlign};color:${this.safeCss(s.color)};background:${this.safeCss(s.backgroundColor)};line-height:${s.lineHeight};padding:${s.paddingTop}px ${s.paddingRight}px ${s.paddingBottom}px ${s.paddingLeft}px;white-space:pre-wrap;">${c}</div>`; }
    if (element.type === 'image') { const e = element as EmailImageElement; const url = this.safeUrl(e.url); const img = url ? `<img src="${url}" alt="${this.escape(e.alt)}" style="width:${e.widthPercent}%;max-width:100%;border-radius:${e.borderRadius}px;display:inline-block;">` : `<div style="padding:24px;border:1px dashed #dfe6f2;color:#6b7280;">Image placeholder</div>`; const link = this.safeUrl(e.linkUrl ?? ''); return `<div style="text-align:${e.alignment};">${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${img}</a>` : img}</div>`; }
    if (element.type === 'spacer') return `<div style="height:${element.height}px;line-height:${element.height}px;">&nbsp;</div>`;
    return `<span style="font-family:monospace;background:#eef4ff;color:#092c7d;padding:2px 6px;border-radius:6px;">${this.escape(renderTokens(element.token))}</span>`;
  }
  stripHtml(v: string): string { return this.sanitizer.sanitize(SecurityContext.HTML, v)?.replace(/<[^>]*>/g, '') ?? ''; }
  private safeUrl(v: string): string { const sanitized = this.sanitizer.sanitize(SecurityContext.URL, v.trim()) ?? ''; return sanitized.startsWith('unsafe:') ? '' : sanitized; }
  private safeCss(v: string): string { return /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$|^rgba?\([\d\s,%.]+\)$/.test(v) ? v : 'transparent'; }
  private escape(v: string): string { return v.replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch] ?? ch)); }
}
