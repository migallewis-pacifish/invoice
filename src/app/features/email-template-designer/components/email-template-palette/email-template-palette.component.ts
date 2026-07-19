import { Component, EventEmitter, Output, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { CdkDrag } from '@angular/cdk/drag-drop';
import { EmailPaletteItem } from '../../../../models/email-template-designer.model';
import { EmailTemplateVariableRegistryService } from '../../services/email-template-variable-registry.service';

@Component({ selector: 'app-email-template-palette', standalone: true, imports: [NgFor, CdkDrag], templateUrl: './email-template-palette.component.html', styleUrl: './email-template-palette.component.scss' })
export class EmailTemplatePaletteComponent {
  @Output() variableInsert = new EventEmitter<string>();
  registry = inject(EmailTemplateVariableRegistryService);
  layouts: EmailPaletteItem[] = [
    { kind: 'layout', label: 'Single column', columnWidths: [100] }, { kind: 'layout', label: 'Two equal columns', columnWidths: [50, 50] },
    { kind: 'layout', label: 'Three equal columns', columnWidths: [33.33, 33.33, 33.34] }, { kind: 'layout', label: '33% / 67%', columnWidths: [33, 67] }, { kind: 'layout', label: '67% / 33%', columnWidths: [67, 33] }
  ];
  elements: EmailPaletteItem[] = [
    { kind: 'element', label: 'Text', elementType: 'text' }, { kind: 'element', label: 'Image', elementType: 'image' }, { kind: 'element', label: 'Spacer', elementType: 'spacer' }, { kind: 'element', label: 'Variable', elementType: 'variable', variablePath: 'invoice.number' }
  ];
}
