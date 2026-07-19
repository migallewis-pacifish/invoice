import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({ selector: 'app-empty-state', standalone: true, template: `<section class="empty-state" aria-live="polite"><span class="icon app-icon" *ngIf="icon" aria-hidden="true">{{ icon }}</span><h2 *ngIf="title">{{ title }}</h2><p>{{ message }}</p><ng-content></ng-content></section>`, imports: [NgIf], styleUrl: './empty-state.component.scss' })
export class EmptyStateComponent { @Input() icon = ''; @Input() title = ''; @Input({ required: true }) message = ''; }
