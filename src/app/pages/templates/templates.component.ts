import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { UploadTemplateComponent } from '../upload-template/upload-template.component';

type TemplateType = 'invoice' | 'letter';

interface TemplateDocument {
  companyId: string;
  name: string;
  type: TemplateType;
  category?: string;
  description?: string;
  fileUrl: string;
  previewUrl?: string;
  active: boolean;
  archived?: boolean;
  createdAt: any;
  updatedAt: any;
}

interface TemplateCard extends TemplateDocument {
  accent: 'invoice' | 'letter' | 'professional';
}

@Component({
  selector: 'app-templates',
  standalone: true,
  imports: [CommonModule, RouterLink, NavBarComponent, UploadTemplateComponent],
  templateUrl: './templates.component.html',
  styleUrl: './templates.component.scss'
})
export class TemplatesComponent {
  protected readonly showUpload = signal(false);

  // TODO: Replace mock gallery data with company-level template documents once the backend supports
  // the full TemplateDocument shape without requiring a destructive migration.
  protected readonly templates = signal<TemplateCard[]>([
    {
      companyId: 'demo-company',
      name: 'Standard Service Invoice',
      type: 'invoice',
      category: 'Professional',
      description: 'Clean, grid-based layout for professional service providers and consultants.',
      fileUrl: '#',
      active: true,
      createdAt: null,
      updatedAt: null,
      accent: 'professional'
    },
    {
      companyId: 'demo-company',
      name: 'Executive Correspondence',
      type: 'letter',
      category: 'Letter',
      description: 'Formal letterhead design with optimized spacing for official company communication.',
      fileUrl: '#',
      active: true,
      createdAt: null,
      updatedAt: null,
      accent: 'letter'
    },
    {
      companyId: 'demo-company',
      name: 'Modern Product Sales',
      type: 'invoice',
      category: 'Invoice',
      description: 'Itemized invoice for physical goods or subscription tiers with visual branding options.',
      fileUrl: '#',
      active: true,
      createdAt: null,
      updatedAt: null,
      accent: 'invoice'
    },
    {
      companyId: 'demo-company',
      name: 'Internal Announcement',
      type: 'letter',
      category: 'Letter',
      description: 'Streamlined letterhead for company-wide memos and official internal announcements.',
      fileUrl: '#',
      active: true,
      createdAt: null,
      updatedAt: null,
      accent: 'letter'
    }
  ]);

  protected readonly activeTemplates = computed(() => this.templates().filter(template => template.active && !template.archived));

  protected openUploadFlow(): void {
    this.showUpload.set(true);
    queueMicrotask(() => document.getElementById('template-upload')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected onUploaded(): void {
    this.showUpload.set(false);
  }

  protected onFilter(): void {
    // TODO: Add filter logic for invoice, letter, active, and archived templates.
  }

  protected editTemplate(template: TemplateCard): void {
    if (template.type === 'invoice') {
      this.openUploadFlow();
      return;
    }
    // TODO: Add letter template editing/upload flow when backend support is available.
  }

  protected duplicateTemplate(_template: TemplateCard): void {
    // TODO: Implement duplicate/copy logic when template document cloning is available.
  }

  protected viewTemplate(_template: TemplateCard): void {
    // TODO: Wire to preview/download once all template documents expose fileUrl/previewUrl.
  }

  protected openMoreMenu(_template: TemplateCard): void {
    // TODO: Replace placeholder with overflow menu actions (archive, rename, set default).
  }
}
