import { NgFor, NgIf, NgTemplateOutlet } from '@angular/common';
import { Component, EventEmitter, Input, Output, TemplateRef } from '@angular/core';

export interface DirectoryTableColumn {
  key: string;
  label: string;
  width?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface DirectoryTableCellContext<T> {
  $implicit: T;
  item: T;
  index: number;
  column: DirectoryTableColumn;
}

@Component({
  selector: 'app-directory-table',
  standalone: true,
  imports: [NgFor, NgIf, NgTemplateOutlet],
  templateUrl: './directory-table.component.html',
  styleUrl: './directory-table.component.scss'
})
export class DirectoryTableComponent<T> {
  @Input({ required: true }) items: T[] = [];
  @Input({ required: true }) columns: DirectoryTableColumn[] = [];
  @Input({ required: true }) cellTemplate!: TemplateRef<DirectoryTableCellContext<T>>;
  @Input() ariaLabel = 'Directory data table';
  @Input() itemLabel = 'items';
  @Input() selectable = false;
  @Input() allSelected = false;
  @Input() isSelected: (item: T) => boolean = () => false;
  @Input() sortKey = '';
  @Input() sortDirection: 'asc' | 'desc' = 'asc';
  @Output() sortChanged = new EventEmitter<string>();
  @Output() selectAllChanged = new EventEmitter<boolean>();
  @Output() selectionChanged = new EventEmitter<{ item: T; checked: boolean }>();
  @Output() rowActivated = new EventEmitter<T>();

  sortLabel(column: DirectoryTableColumn): string {
    if (!column.sortable) return '';
    return this.sortKey === column.key ? (this.sortDirection === 'asc' ? '↑' : '↓') : '↕';
  }

  activateFromKeyboard(event: KeyboardEvent, item: T): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.rowActivated.emit(item);
  }
}
