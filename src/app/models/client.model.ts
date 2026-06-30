import { Address } from './address.model';
import { ClientDocumentStorageSettings } from './document-storage.model';

export type ClientStatus = 'active' | 'inactive' | 'prospect' | 'archived' | string;

export interface Client {
  id: string;
  displayName: string;
  address?: Address;
  email?: string;
  phone?: string;
  vatNo?: string;
  notes?: string;
  status?: ClientStatus;
  relationshipType?: string;
  clientType?: string;
  createdAt: number;
  createdBy?: string;
  documentStorage?: ClientDocumentStorageSettings;
}

export type ClientCreate = Omit<Client, 'id' | 'createdAt' | 'createdBy'>;
export type ClientUpdate = Partial<ClientCreate>;
