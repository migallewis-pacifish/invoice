import { inject, Injectable } from '@angular/core';
import { doc, Firestore, updateDoc } from '@angular/fire/firestore';
import { getDownloadURL, ref, Storage, uploadBytes } from '@angular/fire/storage';
import { ActivityService } from './activity.service';

export interface CompanyBrandAsset {
  name: string;
  path: string;
  imageUrl: string;
  updatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class CompanyBrandingService {
  private readonly storage = inject(Storage);
  private readonly db = inject(Firestore);
  private readonly activity = inject(ActivityService);

  async uploadLogo(companyId: string, file: File): Promise<CompanyBrandAsset> {
    return this.upload(companyId, 'logo', file);
  }

  async uploadSignature(companyId: string, file: File, signerName: string): Promise<CompanyBrandAsset> {
    return this.upload(companyId, 'signature', file, signerName);
  }

  private async upload(companyId: string, kind: 'logo' | 'signature', file: File, name?: string): Promise<CompanyBrandAsset> {
    if (!file?.type?.startsWith('image/')) throw new Error(`${kind === 'logo' ? 'Logo' : 'Signature'} must be an image file.`);
    if (file.size > 2 * 1024 * 1024) throw new Error('Image must be smaller than 2 MB.');
    if (kind === 'signature' && !name?.trim()) throw new Error('Signer name is required.');

    const extension = (file.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const path = `companies/${companyId}/branding/${kind}.${extension}`;
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const imageUrl = await getDownloadURL(storageRef);
    const asset: CompanyBrandAsset = { name: name?.trim() || file.name, path, imageUrl, updatedAt: Date.now() };
    const fields = kind === 'logo'
      ? { logoUrl: imageUrl, logoPath: path }
      : { signature: asset, signatureUrl: imageUrl, signaturePath: path };
    await this.activity.track(companyId, 'update', `companies/${companyId}`, `Updated company ${kind}.`,
      () => updateDoc(doc(this.db, `companies/${companyId}`), fields));
    return asset;
  }
}
