import { DocumentStorageProvider } from '../../models/document-storage.model';
import { EmailProvider, LegacyEmailProvider } from '../../models/email-integration.model';

export interface EmailSettingsFormValue {
  gmailAccountEmail: string;
  exchangeAccountEmail: string;
  sendgridFromEmail: string;
  sendgridFromName: string;
}

export interface StorageSettingsFormValue {
  browserDownloadFolder: string;
  googleDriveFolder: string;
  googleDriveFolderId: string;
  oneDriveFolder: string;
  oneDriveFolderId: string;
  localFolderPath: string;
}

export interface CompanyAccountFormValue {
  name: string;
  regNo: string;
  vatNo: string;
  tel: string;
  email: string;
  website: string;
  line1: string;
  line2: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode: string;
}

const optional = (value: string): string | undefined => value.trim() || undefined;

export function emailSenderFor(provider: EmailProvider | LegacyEmailProvider, value: EmailSettingsFormValue) {
  if (provider === 'gmail') return { email: optional(value.gmailAccountEmail) };
  if (provider === 'microsoft_exchange') return { email: optional(value.exchangeAccountEmail) };
  if (provider === 'nexus_fallback') return undefined;
  return {
    email: optional(value.sendgridFromEmail),
    displayName: optional(value.sendgridFromName)
  };
}

export function folderMetadataFor(provider: DocumentStorageProvider, value: StorageSettingsFormValue) {
  if (provider === 'google_drive') {
    return {
      folderId: optional(value.googleDriveFolderId),
      folderName: optional(value.googleDriveFolder),
      folderUrl: value.googleDriveFolder.trim().startsWith('http') ? value.googleDriveFolder.trim() : undefined
    };
  }
  if (provider === 'onedrive') {
    return {
      folderId: optional(value.oneDriveFolderId),
      folderName: optional(value.oneDriveFolder),
      folderUrl: value.oneDriveFolder.trim().startsWith('http') ? value.oneDriveFolder.trim() : undefined
    };
  }
  if (provider === 'local_folder') {
    return { displayName: optional(value.localFolderPath), path: optional(value.localFolderPath) };
  }
  if (provider === 'browser_download') {
    return { displayName: optional(value.browserDownloadFolder) || 'Browser downloads' };
  }
  return undefined;
}

export function companyAccountPayload(value: CompanyAccountFormValue) {
  return {
    name: value.name.trim(),
    regNo: value.regNo.trim(),
    vatNo: value.vatNo.trim(),
    tel: value.tel.trim(),
    email: value.email.trim(),
    website: value.website.trim(),
    address: {
      line1: value.line1.trim(),
      line2: value.line2.trim(),
      suburb: value.suburb.trim(),
      city: value.city.trim(),
      province: value.province.trim(),
      postalCode: value.postalCode.trim(),
      country: value.country.trim()
    },
    banking: {
      bankName: value.bankName.trim(),
      accountName: value.accountName.trim(),
      accountNumber: value.accountNumber.trim(),
      branchCode: value.branchCode.trim()
    }
  };
}
