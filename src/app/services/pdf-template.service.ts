import { inject, Injectable } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { doc, Firestore, setDoc } from '@angular/fire/firestore';
import { PdfTemplateMapping, PdfTemplateMappingRegion } from '../models/invoice.model';

export interface AnalyzePdfTemplateRequest {
  companyId: string;
  templateId: string;
  sourcePdfPath: string;
}

export interface RenderPdfTemplateRequest {
  companyId: string;
  templateId: string;
  variables: Record<string, unknown>;
  outputProvider?: 'firebase_storage' | 'google_drive' | 'onedrive';
}

@Injectable({ providedIn: 'root' })
export class PdfTemplateService {
  private functions = inject(Functions);
  private db = inject(Firestore);

  async analyze(request: AnalyzePdfTemplateRequest): Promise<PdfTemplateMapping> {
    const callable = httpsCallable<AnalyzePdfTemplateRequest, PdfTemplateMapping>(this.functions, 'analyzePdfTemplate');
    const result = await callable(request);
    return result.data;
  }

  async saveMapping(companyId: string, templateId: string, mapping: PdfTemplateMapping): Promise<void> {
    await setDoc(doc(this.db, `companies/${companyId}/pdfTemplates/${templateId}`), {
      ...mapping,
      companyId,
      templateId,
      updatedAt: Date.now()
    }, { merge: true });
  }

  async render(request: RenderPdfTemplateRequest): Promise<{ storagePath: string; metadata: PdfTemplateMapping['outputMetadata'] }> {
    const callable = httpsCallable<RenderPdfTemplateRequest, { storagePath: string; metadata: PdfTemplateMapping['outputMetadata'] }>(this.functions, 'renderPdfTemplate');
    const result = await callable(request);
    return result.data;
  }

  variableOptions(): string[] {
    return ['invoice.number', 'invoice.date', 'invoice.dueDate', 'client.name', 'client.email', 'invoice.items', 'invoice.subtotal', 'invoice.vat', 'invoice.total', 'company.name', 'custom.notes'];
  }

  withAssignedVariable(mapping: PdfTemplateMapping, region: PdfTemplateMappingRegion, variableKey: string): PdfTemplateMapping {
    return { ...mapping, regions: mapping.regions.map(item => item.id === region.id ? { ...item, variableKey } : item) };
  }
}
