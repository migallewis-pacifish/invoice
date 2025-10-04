import { inject, Injectable } from '@angular/core';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class TemplateService {
  private storage = inject(Storage);
  private db = inject(Firestore);

  async upload(companyId: string, file: File) {
    const path = `companies/${companyId}/templates/invoice.docx`;
    const r = ref(this.storage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    await updateDoc(doc(this.db, `companies/${companyId}`), { templatePath: path });
    return { path, url };
  }

  async getDownloadUrl(path: string) {
    return getDownloadURL(ref(this.storage, path));
  }
}
