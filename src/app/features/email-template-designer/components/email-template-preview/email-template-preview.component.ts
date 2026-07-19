import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgIf } from '@angular/common';
@Component({ selector: 'app-email-template-preview', standalone: true, imports: [NgIf], templateUrl: './email-template-preview.component.html', styleUrl: './email-template-preview.component.scss' })
export class EmailTemplatePreviewComponent { @Input() html=''; @Input() open=false; @Input() width: 'desktop'|'mobile'='desktop'; @Output() widthChange = new EventEmitter<'desktop'|'mobile'>(); @Output() close = new EventEmitter<void>(); }
