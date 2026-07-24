import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { EmailColumn, EmailElement, EmailSection, EmailVariableElement } from '../../../../models/email-template-designer.model';
import { EmailTemplateVariableRegistryService } from '../../services/email-template-variable-registry.service';
@Component({ selector: 'app-email-template-inspector', standalone: true, imports: [FormsModule, NgFor, NgIf], templateUrl: './email-template-inspector.component.html', styleUrl: './email-template-inspector.component.scss' })
export class EmailTemplateInspectorComponent {
  @Input() section?: EmailSection;
  @Input() column?: EmailColumn;
  @Input() element?: EmailElement;
  @Output() changed = new EventEmitter<void>();
  @Output() duplicate = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();

  readonly variableRegistry = inject(EmailTemplateVariableRegistryService);

  selectVariable(element: EmailVariableElement, path: string): void {
    element.path = path;
    element.token = this.variableRegistry.tokenFor(path);
    this.changed.emit();
  }
}
