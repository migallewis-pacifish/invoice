import { Injectable } from '@angular/core';
import { CompanyTemplate, CompanyTemplateFormat } from '../models/invoice.model';
import { requiredVariablesForTemplate, variableLabel } from '../models/template-variable-registry.model';

export type TemplateRenderTarget = 'invoice' | 'letter';

export interface TemplateRendererDescriptor {
  format: CompanyTemplateFormat;
  label: string;
  renderableTargets: TemplateRenderTarget[];
  available: boolean;
}

export function normalizeTemplateFormat(template?: Pick<CompanyTemplate, 'format' | 'storagePath' | 'bodyStoragePath' | 'fileName'> | null): CompanyTemplateFormat {
  if (template?.format) return template.format;
  const path = `${template?.bodyStoragePath || template?.storagePath || template?.fileName || ''}`.toLowerCase();
  return path.endsWith('.docx') || !path ? 'docx' : 'freemarker-html';
}

@Injectable({ providedIn: 'root' })
export class TemplateRendererService {
  readonly renderers: TemplateRendererDescriptor[] = [
    { format: 'docx', label: 'Word DOCX', renderableTargets: ['invoice', 'letter'], available: true },
    { format: 'freemarker-html', label: 'Designed FreeMarker/HTML', renderableTargets: ['invoice', 'letter'], available: false },
    { format: 'pdf-mapped', label: 'PDF-mapped', renderableTargets: ['invoice', 'letter'], available: false }
  ];

  resolve(template: CompanyTemplate, target: TemplateRenderTarget): TemplateRendererDescriptor {
    const format = normalizeTemplateFormat(template);
    const renderer = this.renderers.find(candidate => candidate.format === format && candidate.renderableTargets.includes(target));
    if (!renderer) throw new Error(`No renderer registered for ${format} ${target} templates.`);
    return renderer;
  }

  assertRenderable(template: CompanyTemplate, target: TemplateRenderTarget): void {
    const renderer = this.resolve(template, target);
    if (!renderer.available) throw new Error(`${renderer.label} ${target} rendering is not available yet.`);
  }

  requiredVariableLabels(target: TemplateRenderTarget, format: CompanyTemplateFormat): string[] {
    return requiredVariablesForTemplate(target, format).map(variableLabel);
  }
}
