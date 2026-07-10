import { inject, Injectable } from '@angular/core';
import { doc, docData, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';
import { ActivityService } from './activity.service';
import {
  CompanyEmailSettings,
  DEFAULT_EMAIL_SETTINGS,
  EmailProvider,
  EMAIL_PROVIDER_LABELS,
} from '../models/email-integration.model';

@Injectable({ providedIn: 'root' })
export class EmailIntegrationService {
  private readonly db = inject(Firestore);
  private readonly activityService = inject(ActivityService);

  getCompanySettings(companyId: string): Observable<CompanyEmailSettings> {
    return docData(doc(this.db, `companies/${companyId}`)).pipe(
      map((company: any) => this.normalizeCompanySettings(companyId, company?.emailIntegrations))
    );
  }

  async saveCompanySettings(companyId: string, settings: Partial<CompanyEmailSettings>): Promise<void> {
    await this.activityService.track(
      companyId,
      'update',
      `companies/${companyId}`,
      'Updated company email integration settings.',
      () => setDoc(doc(this.db, `companies/${companyId}`), {
        emailIntegrations: {
          ...settings,
          companyId,
          updatedAt: serverTimestamp(),
        },
      }, { merge: true })
    );
  }

  providerLabel(provider?: EmailProvider): string {
    return provider ? EMAIL_PROVIDER_LABELS[provider] : 'Not selected';
  }

  connectionStatus(settings: CompanyEmailSettings, provider: EmailProvider): 'connected' | 'needs_configuration' {
    if (provider === 'gmail') return settings.gmail?.connected ? 'connected' : 'needs_configuration';
    if (provider === 'microsoft_exchange') return settings.microsoftExchange?.connected ? 'connected' : 'needs_configuration';
    return settings.sendgrid?.connected && settings.sendgrid?.apiKeyConfigured ? 'connected' : 'needs_configuration';
  }

  private normalizeCompanySettings(companyId: string, settings?: Partial<CompanyEmailSettings>): CompanyEmailSettings {
    const defaultProvider = settings?.defaultProvider ?? DEFAULT_EMAIL_SETTINGS.defaultProvider;
    return {
      companyId,
      ...DEFAULT_EMAIL_SETTINGS,
      ...settings,
      defaultProvider,
      gmail: { connected: false, ...settings?.gmail },
      microsoftExchange: { connected: false, ...settings?.microsoftExchange },
      sendgrid: { connected: false, apiKeyConfigured: false, ...settings?.sendgrid },
    };
  }
}
