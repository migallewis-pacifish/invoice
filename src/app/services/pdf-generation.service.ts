import { inject, Injectable } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export type PdfGenerationDocumentType = 'invoice' | 'letter';

export interface PdfGenerationRequest {
  companyId: string;
  clientId?: string;
  clientName?: string;
  documentType: PdfGenerationDocumentType;
  documentId: string;
  payload: Record<string, unknown>;
  client?: Record<string, unknown>;
  company?: Record<string, unknown>;
}

export interface PdfGenerationResult {
  storagePath: string;
  downloadUrl: string;
  mimeType: 'application/pdf';
  provider: 'docx-to-pdf-backend' | 'pdf-mapped-backend' | string;
  fileName: string;
  bytes: number;
  pageCount: number;
  templateId: string;
  generatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class PdfGenerationService {
  private functions = inject(Functions);

  async generate(request: PdfGenerationRequest): Promise<PdfGenerationResult> {
    const callable = httpsCallable<PdfGenerationRequest, PdfGenerationResult>(this.functions, 'generatePdfDocument');
    const result = await callable(request);
    return result.data;
  }
}
