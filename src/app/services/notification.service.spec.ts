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
});
