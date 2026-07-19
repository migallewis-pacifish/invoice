import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `<span class="status-badge" [class]="'status-badge status-' + normalizedStatus">{{ label || statusLabel }}</span>`,
  styleUrl: './status-badge.component.scss'
})
export class StatusBadgeComponent {
  @Input() status = 'unknown';
  @Input() label = '';
  get normalizedStatus(): string { return (this.status || 'unknown').toLowerCase().replace(/[^a-z0-9-]+/g, '-'); }
  get statusLabel(): string { return this.status ? this.status.charAt(0).toUpperCase() + this.status.slice(1) : 'Unknown'; }
}
