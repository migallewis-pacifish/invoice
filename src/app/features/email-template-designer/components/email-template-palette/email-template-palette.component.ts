import { Component, EventEmitter, Output, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { EmailPaletteItem } from '../../../../models/email-template-designer.model';
import { EmailTemplateVariableRegistryService } from '../../services/email-template-variable-registry.service';

@Component({ selector: 'app-email-template-palette', standalone: true, imports: [NgFor, CdkDrag, CdkDropList], templateUrl: './email-template-palette.component.html', styleUrl: './email-template-palette.component.scss' })
export class EmailTemplatePaletteComponent {
  @Output() variableInsert = new EventEmitter<string>();
  registry = inject(EmailTemplateVariableRegistryService);
  layouts: EmailPaletteItem[] = [
    { kind: 'layout', label: 'Single column', description: 'One full-width content area', columnWidths: [100] },
    { kind: 'layout', label: 'Two equal columns', description: 'Two balanced content areas', columnWidths: [50, 50] },
    { kind: 'layout', label: 'Three equal columns', description: 'Three balanced content areas', columnWidths: [33.33, 33.33, 33.34] },
    { kind: 'layout', label: '33% / 67%', description: 'Narrow left, wide right', columnWidths: [33, 67] },
    { kind: 'layout', label: '67% / 33%', description: 'Wide left, narrow right', columnWidths: [67, 33] }
  ];
  elements: EmailPaletteItem[] = [
    { kind: 'element', label: 'Text', elementType: 'text' }, { kind: 'element', label: 'Image', elementType: 'image' }, { kind: 'element', label: 'Spacer', elementType: 'spacer' }, { kind: 'element', label: 'Variable', elementType: 'variable', variablePath: 'invoice.number' }
  ];
}
