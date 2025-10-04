export interface Client {
  id: string;
  displayName: string;
  address?: string;
  email?: string;
  phone?: string;
  vatNo?: string;
  notes?: string;
  createdAt: number;
}

export interface InvoiceItem {
  description: string;     
  rate: string;        
  hours: string; 
  amount?: string;      
}

export interface InvoiceData {
  invoice_number: string;
  invoice_date: string;

  client_name: string;
  client_street: string;
  client_suburb: string;
  client_city: string;
  client_post_code: string;
  client_building: string;
  client_contact_no: string;
  client_email: string;
  services_rendered: string;

  items: InvoiceItem[];

  excluding_vat: string;
  vat_amount: string;
  total: string;
  vat_percentage: string;
  notes: string;
  reference: string;
}

export interface Company {
  id: string;
  name: string;
  regNo?: string;
  address?: string;
  tel?: string;
  email?: string;
  vatNo?: string;
  banking?: {
    accountName: string;
    accountNumber: string;
    branchCode: string;
  };
  templatePath?: string;        
  users: string[];             
  createdAt: number;
}

export interface AppUser {
  uid: string;
  email: string;
  companyId: string;
  role: 'owner' | 'staff';
  createdAt: number;
}

export interface RecurringProfile {
  id: string;
  clientId: string;
  title: string;                // e.g. "Monthly Retainer"
  schedule: 'monthly' | 'quarterly' | 'yearly';
  dayOfMonth?: number;          // e.g. 1..28
  defaultItems: InvoiceData['items'];
  active: boolean;
  createdAt: number;
}