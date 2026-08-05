import { Address } from './address.model';
import { ClientDocumentStorageSettings } from './document-storage.model';

export type ClientStatus = 'active' | 'inactive' | 'prospect' | 'archived' | string;
export type ClientType = 'client' | 'tenant' | 'company' | 'employee';

export interface Client {
  id: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  displayName: string;
  address?: Address;
  email?: string;
  phone?: string;
  vatNo?: string;
  notes?: string;
  status?: ClientStatus;
  relationshipType?: string;
  clientType?: ClientType | string;
  createdAt: number;
  createdBy?: string;
  documentStorage?: ClientDocumentStorageSettings;
}

export type ClientCreate = Omit<Client, 'id' | 'createdAt' | 'createdBy'>;
export type ClientUpdate = Partial<ClientCreate>;
