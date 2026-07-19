import { inject, Injectable } from '@angular/core';
import { collection, collectionData, doc, docData, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { EmailTemplateDefinition } from '../../../models/email-template-designer.model';

@Injectable({ providedIn: 'root' })
export class EmailTemplateDefinitionService {
  private readonly db = inject(Firestore);

  list(companyId: string): Observable<EmailTemplateDefinition[]> {
    return collectionData(collection(this.db, this.collectionPath(companyId)), { idField: 'id' }) as Observable<EmailTemplateDefinition[]>;
  }

  get(companyId: string, templateId: string): Observable<EmailTemplateDefinition | undefined> {
    return docData(doc(this.db, `${this.collectionPath(companyId)}/${templateId}`), { idField: 'id' }) as Observable<EmailTemplateDefinition | undefined>;
  }

  async save(companyId: string, template: EmailTemplateDefinition): Promise<string> {
    const id = template.id ?? crypto.randomUUID();
    await setDoc(doc(this.db, `${this.collectionPath(companyId)}/${id}`), {
      ...template,
      id,
      companyId,
      updatedAt: serverTimestamp(),
      createdAt: template.createdAt ?? serverTimestamp()
    }, { merge: true });
    return id;
  }

  private collectionPath(companyId: string): string {
    return `companies/${companyId}/emailDesignTemplates`;
  }
}
