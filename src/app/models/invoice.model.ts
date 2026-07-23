import { Address } from './address.model';

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
  client_postal_code: string;
  client_building: string;
  client_contact_no: string;
  client_email: string;
  services_rendered: string;

  items: InvoiceItem[];

  shouldIncludeVAT?: boolean;
  excluding_vat: string;
  vat_amount: string;
  total: string;
  vat_percentage: string;
  notes: string;
  reference: string;
}


export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'overpaid' | 'credited' | 'refunded';

export interface InvoicePaymentHistoryEntry {
  type: 'payment' | 'credit' | 'refund';
  amount: number;
  createdAt?: any;
  createdBy?: string;
  notes?: string;
}

export interface InvoiceRecord {
  id?: string;
  invoiceNumber?: string;
  date?: any;
  filename?: string;
  notes?: string;
  subtotal?: number;
  total: number;
  amountPaid: number;
  creditAmount?: number;
  refundAmount?: number;
  overpaidAmount?: number;
  paymentHistory?: InvoicePaymentHistoryEntry[];
  status: InvoiceStatus;
  dueDate?: any;
  paidAt?: any;
  updatedAt?: any;
  createdAt?: any;
  createdBy?: string;
  lastReminderSentAt?: any;
  reminderCount?: number;
  lastReminderType?: 'beforeDue' | 'dueToday' | 'overdue';
}

export interface InvoiceSummaryRecord extends InvoiceRecord {
  clientId: string;
}

export interface Banking {
  bankName: string;  
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
  signatures?: import('./letter.model').LetterSignature[];        
  users: string[];             
  createdAt: number;
  storageProvider?: 'local';
  storagePath?: string;
  currency?: string;
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

export type CompanyTemplateFormat = 'docx' | 'freemarker-html' | 'pdf-mapped';

export interface CompanyTemplatePreviewMetadata {
  storagePath?: string;
  imageStoragePath?: string;
  thumbnailStoragePath?: string;
  updatedAt?: number;
}

export interface CompanyTemplate {
  id: string;
  companyId: string;
  type: 'invoice' | 'letter';
  name: string;
  /**
   * Template renderer format. Older records omitted this field and are treated as DOCX.
   */
  format?: CompanyTemplateFormat;
  /**
   * Primary template body location. Defaults to storagePath for legacy DOCX templates.
   */
  bodyStoragePath?: string;
  /**
   * Legacy storage location used by existing DOCX templates. Kept for compatibility.
   */
  storagePath: string;
  fileName?: string;
  preview?: CompanyTemplatePreviewMetadata;
  requiredVariables?: string[];
  isDefault?: boolean;
  archived?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface BankStatementUpload {
  id: string;
  companyId: string;
  fileName: string;
  storagePath: string;
  uploadedAt?: number;
}

export interface CompanySettings {
  companyId: string;
  invoiceTemplateId?: string;
  letterTemplateId?: string;
  storageProvider?: 'local';
  storagePath?: string;
  currency?: string;
}
