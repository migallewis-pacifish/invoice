import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type TemplatePalette = [string, string, string];

@Component({
  selector: 'app-template-colour-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './template-colour-selector.component.html',
  styleUrl: './template-colour-selector.component.scss'
})
export class TemplateColourSelectorComponent {
  @Input({ required: true }) colors!: TemplatePalette;
  @Input() title = 'Template colours';
  @Input() disabled = false;
  @Output() colorsChange = new EventEmitter<TemplatePalette>();

  update(index: 0 | 1 | 2, event: Event): void {
    if (this.disabled) return;
    const colors = [...this.colors] as TemplatePalette;
    colors[index] = (event.target as HTMLInputElement).value;
    this.colorsChange.emit(colors);
  }
}
