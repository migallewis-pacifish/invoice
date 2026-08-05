import { companyAccountPayload, emailSenderFor, folderMetadataFor } from './settings-page.logic';
import type { StorageSettingsFormValue } from './settings-page.logic';

describe('settings page logic', () => {
  const storageValue: StorageSettingsFormValue = {
    browserDownloadFolder: '',
    googleDriveFolder: ' https://drive.google.com/folders/abc ',
    googleDriveFolderId: ' abc ',
    oneDriveFolder: 'Accounts',
    oneDriveFolderId: 'one-1',
    localFolderPath: ' Documents '
  };

  it('selects sender metadata for each email provider', () => {
    const value = {
      gmailAccountEmail: ' gmail@example.com ',
      exchangeAccountEmail: ' exchange@example.com ',
      sendgridFromEmail: ' sendgrid@example.com ',
      sendgridFromName: ' Accounts '
    };

    expect(emailSenderFor('gmail', value)).toEqual({ email: 'gmail@example.com' });
    expect(emailSenderFor('microsoft_exchange', value)).toEqual({ email: 'exchange@example.com' });
    expect(emailSenderFor('sendgrid', value)).toEqual({ email: 'sendgrid@example.com', displayName: 'Accounts' });
  });

  it('builds provider-specific folder metadata', () => {
    expect(folderMetadataFor('google_drive', storageValue)).toEqual({
      folderId: 'abc',
      folderName: 'https://drive.google.com/folders/abc',
      folderUrl: 'https://drive.google.com/folders/abc'
    });
    expect(folderMetadataFor('onedrive', storageValue)).toEqual({ folderId: 'one-1', folderName: 'Accounts', folderUrl: undefined });
    expect(folderMetadataFor('local_folder', storageValue)).toEqual({ displayName: 'Documents', path: 'Documents' });
    expect(folderMetadataFor('browser_download', storageValue)).toEqual({ displayName: 'Browser downloads' });
    expect(folderMetadataFor('external_link', storageValue)).toBeUndefined();
  });

  it('trims company account values and preserves their nested structure', () => {
    const payload = companyAccountPayload({
      name: ' Acme Ltd ', regNo: ' 123 ', vatNo: '', tel: ' 555 ', email: ' a@b.test ', website: '',
      line1: ' Main Road ', line2: '', suburb: ' Central ', city: ' Cape Town ', province: ' Western Cape ',
      postalCode: ' 8000 ', country: ' South Africa ', bankName: ' Bank ', accountName: ' Acme ',
      accountNumber: ' 100 ', branchCode: ' 200 '
    });

    expect(payload.name).toBe('Acme Ltd');
    expect(payload.address).toEqual(jasmine.objectContaining({ line1: 'Main Road', city: 'Cape Town', postalCode: '8000' }));
    expect(payload.banking).toEqual({ bankName: 'Bank', accountName: 'Acme', accountNumber: '100', branchCode: '200' });
  });
});
