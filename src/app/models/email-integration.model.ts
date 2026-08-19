export type EmailProvider = 'gmail' | 'microsoft_exchange' | 'company_sendgrid' | 'nexus_fallback';
export type LegacyEmailProvider = 'sendgrid';

export interface EmailSenderIdentity {
  email?: string;
  displayName?: string;
}

export interface ProviderConnectionSettings {
  connected: boolean;
  configured?: boolean;
  health?: string;
  connectedAt?: any;
  connectedBy?: string;
  accountEmail?: string;
  tenantId?: string;
  apiKeyConfigured?: boolean;
  fromEmail?: string;
  fromName?: string;
  webhookConfigured?: boolean;
}

/** Public, non-secret state for a company-owned SendGrid account. Credentials
 * are resolved by Functions from COMPANY_SENDGRID_CREDENTIALS. */
export interface CompanyOwnedSendGridProvider extends ProviderConnectionSettings {
  mode: 'company_owned_sendgrid';
  credentialReference?: string;
  senderVerified?: boolean;
  domainVerified?: boolean;
  connectionTestedAt?: any;
  fromNameValidated?: boolean;
}

/** Nexus always sends with the platform credential and Nexus sending domain. */
export interface NexusManagedFallbackProvider {
  mode: 'nexus_managed_fallback';
  enabled: boolean;
  configured?: boolean;
  /** A validated company mailbox used only for replies; never as From. */
  replyToEmail?: string;
  effectiveFromEmail?: string;
  dailyQuota?: number;
}

export interface CompanyEmailSettings {
  companyId: string;
  defaultProvider: EmailProvider;
  /** False until an administrator/user deliberately saves a provider choice. */
  onboardingCompleted?: boolean;
  selectedSender?: EmailSenderIdentity;
  gmail?: ProviderConnectionSettings;
  microsoftExchange?: ProviderConnectionSettings;
  sendgrid?: CompanyOwnedSendGridProvider;
  nexusFallback?: NexusManagedFallbackProvider;
  updatedAt?: any;
}

export type CompanyEmailPreferences = Pick<CompanyEmailSettings,
  'companyId' | 'defaultProvider' | 'onboardingCompleted' | 'selectedSender' | 'updatedAt'> & {
  nexusFallback?: Pick<NexusManagedFallbackProvider, 'enabled' | 'replyToEmail'>;
};

export type CompanyEmailConnectionStatus = Pick<CompanyEmailSettings,
  'gmail' | 'microsoftExchange' | 'sendgrid'> & {
  nexusFallback?: Omit<NexusManagedFallbackProvider, 'enabled' | 'replyToEmail'>;
};

export const EMAIL_PROVIDER_LABELS: Record<EmailProvider, string> = {
  gmail: 'Google Workspace Gmail',
  microsoft_exchange: 'Microsoft 365 Exchange',
  company_sendgrid: 'Company SendGrid',
  nexus_fallback: 'Nexus managed fallback',
};

export const DEFAULT_EMAIL_SETTINGS: Omit<CompanyEmailSettings, 'companyId'> = {
  defaultProvider: 'nexus_fallback',
  onboardingCompleted: false,
  gmail: { connected: false },
  microsoftExchange: { connected: false },
  sendgrid: { mode: 'company_owned_sendgrid', connected: false, apiKeyConfigured: false },
  nexusFallback: { mode: 'nexus_managed_fallback', enabled: false, configured: false },
};
