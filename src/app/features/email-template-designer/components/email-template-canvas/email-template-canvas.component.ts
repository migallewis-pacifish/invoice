import { NgFor, NgIf, NgStyle, NgSwitch, NgSwitchCase } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
  transferArrayItem
} from '@angular/cdk/drag-drop';
import {
  EmailElement,
  EmailPaletteItem,
  EmailSection,
  EmailSelection
} from '../../../../models/email-template-designer.model';
import { EmailTemplateBuilderService } from '../../services/email-template-builder.service';

@Component({
  selector: 'app-email-template-canvas',
  standalone: true,
  imports: [NgFor, NgIf, NgStyle, NgSwitch, NgSwitchCase, CdkDropList, CdkDrag],
  templateUrl: './email-template-canvas.component.html',
  styleUrl: './email-template-canvas.component.scss'
})
export class EmailTemplateCanvasComponent {
  @Input({ required: true }) sections: EmailSection[] = [];
  @Input() selection: EmailSelection = null;
  @Output() sectionsChange = new EventEmitter<EmailSection[]>();
  @Output() selectionChange = new EventEmitter<EmailSelection>();

  readonly canvasDropListId = 'email-template-section-canvas';
  readonly layoutPaletteDropListId = 'email-template-layout-palette';
  readonly elementPaletteDropListId = 'email-template-element-palette';
  readonly variablePaletteDropListId = 'email-template-variable-palette';

  private readonly builder = inject(EmailTemplateBuilderService);

  sectionDropListIds(): string[] {
    return [this.canvasDropListId, this.layoutPaletteDropListId];
  }

  columnDropListIds(): string[] {
    return [
      this.elementPaletteDropListId,
      this.variablePaletteDropListId,
      ...this.sections.flatMap(section => section.columns.map(column => column.id))
    ];
  }

  sectionDropPredicate = (drag: CdkDrag<EmailPaletteItem | EmailSection>): boolean => {
    const data = drag.data;
    return !this.isPaletteItem(data) || data.kind === 'layout';
  };

  elementDropPredicate = (drag: CdkDrag<EmailPaletteItem | EmailElement>): boolean => {
    const data = drag.data;
    return !this.isPaletteItem(data) || data.kind === 'element';
  };

  dropSection(event: CdkDragDrop<EmailSection[]>): void {
    const data = event.item.data as EmailPaletteItem | EmailSection;

    if (this.isPaletteItem(data) && data.kind === 'layout' && data.columnWidths) {
      const section = this.builder.newSection(data.columnWidths);
      this.sections.splice(event.currentIndex, 0, section);
      this.selectionChange.emit({ kind: 'section', sectionId: section.id });
      this.emitSections();
      return;
    }

    if (event.previousContainer === event.container) {
      moveItemInArray(this.sections, event.previousIndex, event.currentIndex);
      this.emitSections();
    }
  }

  dropElement(event: CdkDragDrop<EmailElement[]>): void {
    const data = event.item.data as EmailPaletteItem | EmailElement;

    if (this.isPaletteItem(data)) {
      if (data.kind !== 'element' || !data.elementType) return;
      const element = this.builder.newElement(data.elementType, data.variablePath);
      event.container.data.splice(event.currentIndex, 0, element);
      this.selectionChange.emit(this.findElementSelection(element.id));
      this.emitSections();
      return;
    }

    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
    }

    this.emitSections();
  }

  selectSection(section: EmailSection): void {
    this.selectionChange.emit({ kind: 'section', sectionId: section.id });
  }

  selectElement(section: EmailSection, columnId: string, element: EmailElement, event: Event): void {
    event.stopPropagation();
    this.selectionChange.emit({ kind: 'element', sectionId: section.id, columnId, elementId: element.id });
  }

  isSelectedSection(section: EmailSection): boolean {
    return this.selection?.kind === 'section' && this.selection.sectionId === section.id;
  }

  isSelectedElement(element: EmailElement): boolean {
    return this.selection?.kind === 'element' && this.selection.elementId === element.id;
  }

  private isPaletteItem(data: EmailPaletteItem | EmailSection | EmailElement): data is EmailPaletteItem {
    return 'kind' in data;
  }

  private findElementSelection(elementId: string): Exclude<EmailSelection, null> | null {
    for (const section of this.sections) {
      for (const column of section.columns) {
        if (column.elements.some(element => element.id === elementId)) {
          return { kind: 'element', sectionId: section.id, columnId: column.id, elementId };
        }
      }
    }
    return null;
  }

  private emitSections(): void {
    this.sectionsChange.emit([...this.sections]);
  }
}
