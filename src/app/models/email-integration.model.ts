export type EmailProvider = 'gmail' | 'microsoft_exchange' | 'sendgrid';

export interface EmailSenderIdentity {
  email?: string;
  displayName?: string;
}

export interface ProviderConnectionSettings {
  connected: boolean;
  connectedAt?: any;
  connectedBy?: string;
  accountEmail?: string;
  tenantId?: string;
  apiKeyConfigured?: boolean;
  fromEmail?: string;
  fromName?: string;
  webhookConfigured?: boolean;
}

export interface CompanyEmailSettings {
  companyId: string;
  defaultProvider: EmailProvider;
  selectedSender?: EmailSenderIdentity;
  gmail?: ProviderConnectionSettings;
  microsoftExchange?: ProviderConnectionSettings;
  sendgrid?: ProviderConnectionSettings;
  updatedAt?: any;
}

export const EMAIL_PROVIDER_LABELS: Record<EmailProvider, string> = {
  gmail: 'Google Workspace Gmail',
  microsoft_exchange: 'Microsoft 365 Exchange',
  sendgrid: 'SendGrid',
};

export const DEFAULT_EMAIL_SETTINGS: Omit<CompanyEmailSettings, 'companyId'> = {
  defaultProvider: 'gmail',
  gmail: { connected: false },
  microsoftExchange: { connected: false },
  sendgrid: { connected: false, apiKeyConfigured: false },
};
