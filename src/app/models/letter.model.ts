export interface LetterSignature {
  id: string;
  name: string;
  path: string;
  url?: string;
  createdAt: number;
}

export interface LetterData {
  letter_title: string;
  letter_date: string;
  letter_message: string;
  client_name: string;
  client_street: string;
  client_suburb: string;
  client_city: string;
  client_province: string;
  client_postal_code: string;
  client_contact_no: string;
  client_email: string;
  company_name: string;
  company_reg_no: string;
  company_tel: string;
  company_email: string;
  company_street: string;
  company_suburb: string;
  company_city: string;
  company_province: string;
  company_postal_code: string;
  signed_by: string;
  signature_url: string;
}
