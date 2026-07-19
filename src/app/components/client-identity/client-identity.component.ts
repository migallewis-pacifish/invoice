import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-client-identity',
  standalone: true,
  template: `<div class="client-identity"><span class="avatar" [style.background]="avatarBackground" [style.color]="avatarColor">{{ initials }}</span><div><strong>{{ name }}</strong><span *ngIf="description">{{ description }}</span></div></div>`,
  imports: [NgIf],
  styleUrl: './client-identity.component.scss'
})
export class ClientIdentityComponent {
  @Input({ required: true }) name = '';
  @Input() description = '';
  @Input() avatarBackground = '#e8f1fb';
  @Input() avatarColor = 'var(--primary)';
  get initials(): string { return (this.name || 'Client').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join(''); }
}
