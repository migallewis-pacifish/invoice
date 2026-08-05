import { TestBed } from '@angular/core/testing';

import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotificationService);
  });

  it('stores success messages', () => {
    service.success('Saved successfully.');

    expect(service.notifications()).toEqual([
      jasmine.objectContaining({ type: 'success', message: 'Saved successfully.' })
    ]);
  });

  it('stores user-facing errors and keeps diagnostic detail', () => {
    const consoleError = spyOn(console, 'error');
    const detail = new Error('low-level failure');

    service.error('Something went wrong.', detail);

    expect(service.notifications()).toEqual([
      jasmine.objectContaining({ type: 'error', message: 'Something went wrong.', detail })
    ]);
    expect(consoleError).toHaveBeenCalledWith('Something went wrong.', detail);
  });

  it('resolves confirmation notifications from the user response', async () => {
    const result = service.confirm('Delete this client?', 'Delete');
    const notification = service.notifications()[0];

    expect(notification).toEqual(jasmine.objectContaining({
      type: 'confirmation',
      message: 'Delete this client?',
      confirmLabel: 'Delete'
    }));

    service.respond(notification.id, true);

    await expectAsync(result).toBeResolvedTo(true);
    expect(service.notifications()).toEqual([]);
  });
});
