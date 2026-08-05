import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'info' | 'confirmation';

export interface AppNotification {
  id: number;
  type: NotificationType;
  message: string;
  detail?: unknown;
  confirmLabel?: string;
  cancelLabel?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private nextId = 1;
  private readonly notificationsSignal = signal<AppNotification[]>([]);
  private readonly confirmationResolvers = new Map<number, (confirmed: boolean) => void>();

  readonly notifications = this.notificationsSignal.asReadonly();

  success(message: string): void {
    this.push({ type: 'success', message }, true);
  }

  error(message: string, detail?: unknown): void {
    if (detail !== undefined) {
      console.error(message, detail);
    }
    this.push({ type: 'error', message, detail }, true);
  }

  info(message: string): void {
    this.push({ type: 'info', message }, true);
  }

  confirm(message: string, confirmLabel = 'Confirm', cancelLabel = 'Cancel'): Promise<boolean> {
    const id = this.push({ type: 'confirmation', message, confirmLabel, cancelLabel });
    return new Promise(resolve => this.confirmationResolvers.set(id, resolve));
  }

  respond(id: number, confirmed: boolean): void {
    this.confirmationResolvers.get(id)?.(confirmed);
    this.confirmationResolvers.delete(id);
    this.remove(id);
  }

  dismiss(id: number): void {
    this.respond(id, false);
  }

  clear(): void {
    this.confirmationResolvers.forEach(resolve => resolve(false));
    this.confirmationResolvers.clear();
    this.notificationsSignal.set([]);
  }

  private push(notification: Omit<AppNotification, 'id'>, autoDismiss = false): number {
    const id = this.nextId++;
    this.notificationsSignal.update(notifications => [
      ...notifications,
      { ...notification, id }
    ]);
    if (autoDismiss) globalThis.setTimeout(() => this.remove(id), 5000);
    return id;
  }

  private remove(id: number): void {
    this.notificationsSignal.update(notifications => notifications.filter(notification => notification.id !== id));
  }
}
