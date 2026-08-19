import { inject, Injectable } from '@angular/core';
import { doc, docData, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { combineLatest, map, Observable } from 'rxjs';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { ActivityService } from './activity.service';
import {
  CompanyEmailSettings,
  CompanyEmailPreferences,
  DEFAULT_EMAIL_SETTINGS,
  EmailProvider,
  EMAIL_PROVIDER_LABELS,
} from '../models/email-integration.model';

@Injectable({ providedIn: 'root' })
export class EmailIntegrationService {
  private readonly db = inject(Firestore);
  private readonly activityService = inject(ActivityService);
  private readonly functions = inject(Functions, { optional: true });

  async providerConfiguration(): Promise<{ gmail: boolean; microsoftExchange: boolean; nexusFallback: boolean; nexusFromEmail?: string; microsoftTenantPolicy?: string }> {
    if (!this.functions) return { gmail: false, microsoftExchange: false, nexusFallback: false };
    return (await httpsCallable<void, { gmail: boolean; microsoftExchange: boolean; nexusFallback: boolean; nexusFromEmail?: string; microsoftTenantPolicy?: string }>(this.functions, 'getEmailProviderConfiguration')()).data;
  }

  async connectEmailProvider(provider: 'gmail' | 'microsoft_exchange', companyId: string, accountEmail?: string): Promise<string> {
    if (!this.functions) throw new Error('Firebase Functions is not configured.');
    const endpoint = provider === 'gmail' ? 'startGmailOAuth' : 'startMicrosoftEmailOAuth';
    const result = await httpsCallable<{ companyId: string; accountEmail?: string }, { url: string }>(this.functions, endpoint)({ companyId, accountEmail: accountEmail || undefined });
    return result.data.url;
  }

  async disconnectEmailProvider(provider: 'gmail' | 'microsoft_exchange', companyId: string): Promise<void> {
    if (!this.functions) throw new Error('Firebase Functions is not configured.');
    const endpoint = provider === 'gmail' ? 'disconnectGmail' : 'disconnectMicrosoftEmail';
    await httpsCallable<{ companyId: string }, { connected: boolean }>(this.functions, endpoint)({ companyId });
  }

  async verifyCompanySendGrid(companyId: string): Promise<CompanyEmailSettings['sendgrid']> {
    if (!this.functions) throw new Error('Firebase Functions is not configured.');
    const result = await httpsCallable<{ companyId: string }, NonNullable<CompanyEmailSettings['sendgrid']>>(
      this.functions, 'verifyCompanySendGrid'
    )({ companyId });
    return result.data;
  }

  getCompanySettings(companyId: string): Observable<CompanyEmailSettings> {
    const base = `companies/${companyId}/emailIntegration`;
    return combineLatest([
      docData(doc(this.db, `${base}/preferences`)),
      docData(doc(this.db, `${base}/status`)),
    ]).pipe(
      map(([preferences, status]) => this.normalizeCompanySettings(companyId, {
        ...(preferences as object), ...(status as object),
        nexusFallback: {
          ...(status as any)?.nexusFallback,
          ...(preferences as any)?.nexusFallback,
        },
      }))
    );
  }

  async saveCompanySettings(companyId: string, settings: Omit<CompanyEmailPreferences, 'companyId' | 'updatedAt'>): Promise<void> {
    await this.activityService.track(
      companyId,
      'update',
      `companies/${companyId}/emailIntegration/preferences`,
      'Updated company email integration settings.',
      () => setDoc(doc(this.db, `companies/${companyId}/emailIntegration/preferences`), {
        ...settings,
        companyId,
        updatedAt: serverTimestamp(),
      })
    );
  }

  providerLabel(provider?: EmailProvider): string {
    return provider ? EMAIL_PROVIDER_LABELS[provider] : 'Not selected';
  }

  connectionStatus(settings: CompanyEmailSettings, provider: EmailProvider): 'connected' | 'needs_configuration' {
    if (provider === 'gmail') return settings.gmail?.connected ? 'connected' : 'needs_configuration';
    if (provider === 'microsoft_exchange') return settings.microsoftExchange?.connected ? 'connected' : 'needs_configuration';
    if (provider === 'company_sendgrid') return settings.sendgrid?.connected && settings.sendgrid?.apiKeyConfigured ? 'connected' : 'needs_configuration';
    return settings.nexusFallback?.enabled && settings.nexusFallback?.configured ? 'connected' : 'needs_configuration';
  }

  private normalizeCompanySettings(companyId: string, settings?: Partial<CompanyEmailSettings>): CompanyEmailSettings {
    const storedDefault = settings?.defaultProvider as EmailProvider | 'sendgrid' | undefined;
    const defaultProvider: EmailProvider = storedDefault === 'sendgrid' ? 'company_sendgrid' : storedDefault ?? DEFAULT_EMAIL_SETTINGS.defaultProvider;
    return {
      companyId,
      ...DEFAULT_EMAIL_SETTINGS,
      ...settings,
      defaultProvider,
      onboardingCompleted: settings?.onboardingCompleted ?? !!settings?.defaultProvider,
      gmail: { connected: false, ...settings?.gmail },
      microsoftExchange: { connected: false, ...settings?.microsoftExchange },
      sendgrid: { mode: 'company_owned_sendgrid', connected: false, apiKeyConfigured: false, ...settings?.sendgrid },
      nexusFallback: { mode: 'nexus_managed_fallback', enabled: false, configured: false, ...settings?.nexusFallback },
    };
  }
}
