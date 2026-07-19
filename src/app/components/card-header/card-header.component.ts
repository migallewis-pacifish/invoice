import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';
@Component({ selector: 'app-card-header', standalone: true, template: `<div class="card-header"><div><h2>{{ title }}</h2><p *ngIf="subtitle">{{ subtitle }}</p></div><div class="actions"><ng-content></ng-content></div></div>`, imports: [NgIf], styleUrl: './card-header.component.scss' })
export class CardHeaderComponent { @Input({ required: true }) title = ''; @Input() subtitle = ''; }
