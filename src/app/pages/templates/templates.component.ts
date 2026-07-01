import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { collection, collectionData, doc, docData, Firestore } from '@angular/fire/firestore';
import { take } from 'rxjs';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { AppUser, CompanyTemplate } from '../../models/invoice.model';
import { TemplateService } from '../../services/template.service';
import { UploadTemplateComponent } from '../upload-template/upload-template.component';

type TemplateType = 'invoice' | 'letter';

interface TemplateDocument extends CompanyTemplate {
  category?: string;
  description?: string;
  fileUrl: string;
  previewUrl?: string;
  active: boolean;
  archived?: boolean;
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
  private auth = inject(Auth);
  private db = inject(Firestore);
  private router = inject(Router);
  private templateService = inject(TemplateService);

  protected readonly showUpload = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly templates = signal<TemplateCard[]>([]);

  constructor() {
    this.loadCompanyTemplates();
  }

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

  protected async viewTemplate(template: TemplateCard): Promise<void> {
    try {
      const url = await this.templateService.getDownloadUrl(template.storagePath);
      window.open(url, '_blank', 'noopener');
    } catch (e: any) {
      this.error.set(e?.message ?? 'Unable to open template.');
    }
  }

  protected openMoreMenu(_template: TemplateCard): void {
    // TODO: Replace placeholder with overflow menu actions (archive, rename, set default).
  }

  private loadCompanyTemplates(): void {
    authState(this.auth).pipe(take(1)).subscribe(async user => {
      if (!user) {
        await this.router.navigate(['/login']);
        return;
      }

      const userSnap = await docData(doc(this.db, `users/${user.uid}`)).pipe(take(1)).toPromise() as AppUser | undefined;
      const companyId = userSnap?.companyId;
      if (!companyId) {
        await this.router.navigate(['/register-company']);
        return;
      }

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
    });
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
      description: `${template.fileName || name} stored at ${template.storagePath}.`,
      fileUrl: template.storagePath,
      active: !template.archived,
      accent: type === 'letter' ? 'letter' : 'invoice'
    };
  }
}
