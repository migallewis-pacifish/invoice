import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-dialog-shell',
  standalone: true,
  template: `
    <div class="dialog-shell">
      <div class="dialog-header">
        <h3>{{ title }}</h3>
        <button class="icon-btn" type="button" [attr.aria-label]="'Close ' + title" (click)="closed.emit()">✕</button>
      </div>
      <ng-content></ng-content>
    </div>
  `,
  styleUrl: './dialog-shell.component.scss'
})
export class DialogShellComponent {
  @Input({ required: true }) title = '';
  @Output() closed = new EventEmitter<void>();
}
