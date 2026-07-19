import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { NgFor, NgIf, NgStyle, NgSwitch, NgSwitchCase } from '@angular/common';
import { CdkDragDrop, CdkDropList, CdkDrag, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { EmailElement, EmailPaletteItem, EmailSection, EmailSelection } from '../../../../models/email-template-designer.model';
import { EmailTemplateBuilderService } from '../../services/email-template-builder.service';
@Component({ selector: 'app-email-template-canvas', standalone: true, imports: [NgFor, NgIf, NgStyle, NgSwitch, NgSwitchCase, CdkDropList, CdkDrag], templateUrl: './email-template-canvas.component.html', styleUrl: './email-template-canvas.component.scss' })
export class EmailTemplateCanvasComponent {
  @Input({ required: true }) sections: EmailSection[] = []; @Input() selection: EmailSelection = null; @Output() sectionsChange = new EventEmitter<EmailSection[]>(); @Output() selectionChange = new EventEmitter<EmailSelection>();
  private builder = inject(EmailTemplateBuilderService);
  sectionIds(){ return ['canvas']; } columnIds(){ return this.sections.flatMap(s => s.columns.map(c => c.id)); }
  dropSection(event: CdkDragDrop<EmailSection[]>) { const data = event.item.data as EmailPaletteItem; if (data?.kind === 'layout' && data.columnWidths) this.sections.splice(event.currentIndex,0,this.builder.newSection(data.columnWidths)); else if (event.previousContainer === event.container) moveItemInArray(this.sections,event.previousIndex,event.currentIndex); this.emit(); }
  dropElement(event: CdkDragDrop<EmailElement[]>) { const data = event.item.data as EmailPaletteItem; if (data?.kind === 'layout') return; if (data?.kind === 'element' && data.elementType) event.container.data.splice(event.currentIndex,0,this.builder.newElement(data.elementType,data.variablePath)); else if (event.previousContainer === event.container) moveItemInArray(event.container.data,event.previousIndex,event.currentIndex); else transferArrayItem(event.previousContainer.data,event.container.data,event.previousIndex,event.currentIndex); this.emit(); }
  selectSection(section: EmailSection){ this.selectionChange.emit({kind:'section',sectionId:section.id}); }
  selectElement(section: EmailSection, columnId: string, element: EmailElement, ev: Event){ ev.stopPropagation(); this.selectionChange.emit({kind:'element',sectionId:section.id,columnId,elementId:element.id}); }
  isSelectedSection(s: EmailSection){ return this.selection?.kind==='section'&&this.selection.sectionId===s.id; } isSelectedElement(e: EmailElement){ return this.selection?.kind==='element'&&this.selection.elementId===e.id; }
  private emit(){ this.sectionsChange.emit([...this.sections]); }
}
