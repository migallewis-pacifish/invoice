import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';
@Component({ selector: 'app-form-field', standalone: true, template: `<label><span class="label">{{ label }} <b *ngIf="required">*</b></span><ng-content></ng-content><small class="hint" *ngIf="hint">{{ hint }}</small><small class="error" *ngIf="error">{{ error }}</small></label>`, imports: [NgIf], styleUrl: './form-field.component.scss' })
export class FormFieldComponent { @Input({ required: true }) label = ''; @Input() hint = ''; @Input() error = ''; @Input() required = false; }
