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
export interface Address {
  line1: string;
  line2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
}

export interface Banking {
  accountName: string;
  accountNumber: string;
  branchCode: string;
}

export interface Company {
  id: string;
  name: string;
  regNo?: string;
  address?: Address;
  tel?: string;
  email?: string;
  vatNo?: string;
  banking?: Banking;
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

export interface RegisterPayload {
  companyName: string;
  regNo?: string;
  address?: string;
  tel?: string;
  email: string;          // owner login
  password: string;       // owner password
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

export interface RegisterWizardPayload {
  // step 1
  companyName: string;
  tel: string;
  ownerEmail: string;
  ownerPassword: string;

  // step 2
  regNo?: string;
  vatNo?: string;

  // step 3
  address: Address;

  // step 4
  banking?: Banking;

  // step 5
  extraUserEmail?: string;   // optional, max 1 additional user
}
