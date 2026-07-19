import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';
@Component({ selector: 'app-metric-card', standalone: true, template: `<article class="metric-card" [class]="'metric-card ' + tone"><div class="label">{{ label }} <span class="app-icon metric-icon" *ngIf="icon" aria-hidden="true">{{ icon }}</span></div><strong>{{ value }}</strong><small *ngIf="supportingText">{{ supportingText }}</small></article>`, imports: [NgIf], styleUrl: './metric-card.component.scss' })
export class MetricCardComponent { @Input({ required: true }) label = ''; @Input({ required: true }) value: string | number = ''; @Input() supportingText = ''; @Input() icon = ''; @Input() tone = ''; }
