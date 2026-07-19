import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { EmailElement, EmailSection } from '../../../../models/email-template-designer.model';
@Component({ selector: 'app-email-template-inspector', standalone: true, imports: [FormsModule, NgIf], templateUrl: './email-template-inspector.component.html', styleUrl: './email-template-inspector.component.scss' })
export class EmailTemplateInspectorComponent { @Input() section?: EmailSection; @Input() element?: EmailElement; @Output() changed = new EventEmitter<void>(); @Output() duplicate = new EventEmitter<void>(); @Output() delete = new EventEmitter<void>(); }
