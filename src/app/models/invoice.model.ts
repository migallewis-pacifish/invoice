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