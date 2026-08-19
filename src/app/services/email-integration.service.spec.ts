import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { ActivityService } from './activity.service';
import { EmailIntegrationService } from './email-integration.service';

function activityStub() {
  return {
    track: (_companyId: string, _type: string, _path: string, _description: string, operation: () => Promise<unknown>) => operation()
  };
}

describe('EmailIntegrationService', () => {
  let service: EmailIntegrationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Firestore, useValue: {} },
        { provide: ActivityService, useValue: activityStub() }
      ]
    });
    service = TestBed.inject(EmailIntegrationService);
  });

  it('returns user-friendly provider labels', () => {
    expect(service.providerLabel('gmail')).toBe('Google Workspace Gmail');
    expect(service.providerLabel('microsoft_exchange')).toBe('Microsoft 365 Exchange');
    expect(service.providerLabel('company_sendgrid')).toBe('Company SendGrid');
    expect(service.providerLabel('nexus_fallback')).toBe('Nexus managed fallback');
    expect(service.providerLabel(undefined)).toBe('Not selected');
  });

  it('normalizes missing nested settings with safe defaults', () => {
    const normalized = (service as any).normalizeCompanySettings('company-1', { defaultProvider: 'sendgrid' });

    expect(normalized.companyId).toBe('company-1');
    expect(normalized.defaultProvider).toBe('company_sendgrid');
    expect(normalized.gmail.connected).toBeFalse();
    expect(normalized.microsoftExchange.connected).toBeFalse();
    expect(normalized.sendgrid).toEqual(jasmine.objectContaining({ connected: false, apiKeyConfigured: false }));
  });

  it('requires configured API metadata for SendGrid connection status', () => {
    const missingApiKey = (service as any).normalizeCompanySettings('company-1', {
      defaultProvider: 'company_sendgrid',
      sendgrid: { mode: 'company_owned_sendgrid', connected: true, apiKeyConfigured: false }
    });
    const configured = (service as any).normalizeCompanySettings('company-1', {
      defaultProvider: 'company_sendgrid',
      sendgrid: { mode: 'company_owned_sendgrid', connected: true, apiKeyConfigured: true }
    });

    expect(service.connectionStatus(missingApiKey, 'company_sendgrid')).toBe('needs_configuration');
    expect(service.connectionStatus(configured, 'company_sendgrid')).toBe('connected');
  });
});
