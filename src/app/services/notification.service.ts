import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error';

export interface AppNotification {
  id: number;
  type: NotificationType;
  message: string;
  detail?: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private nextId = 1;
  private readonly notificationsSignal = signal<AppNotification[]>([]);

  readonly notifications = this.notificationsSignal.asReadonly();

  success(message: string): void {
    this.push({ type: 'success', message });
  }

  error(message: string, detail?: unknown): void {
    if (detail !== undefined) {
      console.error(message, detail);
    }
    this.push({ type: 'error', message, detail });
  }

  dismiss(id: number): void {
    this.notificationsSignal.update(notifications => notifications.filter(notification => notification.id !== id));
  }

  clear(): void {
    this.notificationsSignal.set([]);
  }

  private push(notification: Omit<AppNotification, 'id'>): void {
    this.notificationsSignal.update(notifications => [
      ...notifications,
      { ...notification, id: this.nextId++ }
    ]);
  }
}
