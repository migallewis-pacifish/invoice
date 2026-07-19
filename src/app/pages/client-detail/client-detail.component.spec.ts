import { signal } from '@angular/core';
import { of } from 'rxjs';
import { ClientDetailComponent } from './client-detail.component';
import { Client } from '../../models/client.model';

describe('ClientDetailComponent client summary', () => {
  let component: ClientDetailComponent;

  beforeEach(() => {
    component = Object.create(ClientDetailComponent.prototype) as ClientDetailComponent;
    component.client = signal<Client | null>(null);
    component.noteDraft = signal('');
    component.activeTab = signal('overview' as any);
    component.editingClient = signal(false);
    component.clientStorageProvider = signal('company_default');
    component.clientStorageLocation = signal('');
  });

  it('uses the Firestore client displayName as the primary contact', () => {
    component.client.set({
      id: 'client-1',
      displayName: 'Green Acre Landlord',
      createdAt: 123,
      status: 'active',
      notes: 'Lease renews annually.',
    });

    expect(component.primaryContact).toBe('Green Acre Landlord');
  });

  it('uses flexible relationship type and status fields from the client model', () => {
    component.client.set({
      id: 'client-2',
      displayName: 'Summit Consulting Client',
      createdAt: 123,
      relationshipType: 'Consultant to client',
      status: 'prospect',
    });

    expect(component.relationshipType).toBe('Consultant to client');
    expect(component.clientStatus).toBe('prospect');
    expect(component.clientStatusClass).toBe('status-prospect');
  });

  it('falls back to clientType when relationshipType is not set', () => {
    component.client.set({
      id: 'client-3',
      displayName: 'Bluebird Customer',
      createdAt: 123,
      clientType: 'Company to customer',
    });

    expect(component.relationshipType).toBe('Company to customer');
  });

  it('keeps client notes in the note draft shown on the workspace', () => {
    component.updateNote('Firestore note for this client.');

    expect(component.noteDraft()).toBe('Firestore note for this client.');
  });

  it('refreshes the client model after an edit is saved', () => {
    const updatedClient: Client = {
      id: 'client-4',
      displayName: 'Updated Client',
      createdAt: 123,
      notes: 'Updated Firestore notes.',
      status: 'active',
    };
    component.clientId = signal('client-4');
    (component as any).clientSvc = {
      getClientById: () => of(updatedClient),
    };
    component.editingClient.set(true);

    component.onClientSaved();

    expect(component.client()).toEqual(updatedClient);
    expect(component.noteDraft()).toBe('Updated Firestore notes.');
    expect(component.editingClient()).toBeFalse();
  });

});
