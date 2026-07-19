import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';
@Component({ selector: 'app-loading-state', standalone: true, template: `<div class="loading" [class.inline]="inline"><div class="spinner"></div><p *ngIf="message">{{ message }}</p></div>`, imports: [NgIf], styleUrl: './loading-state.component.scss' })
export class LoadingStateComponent { @Input() message = 'Loading…'; @Input() inline = false; }
