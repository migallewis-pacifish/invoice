import { Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';

export interface RenameTemplateDialogData {
  name: string;
}

@Component({
  selector: 'app-rename-template-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './rename-template-dialog.component.html',
  styleUrl: './rename-template-dialog.component.scss'
})
export class RenameTemplateDialogComponent {
  private readonly dialogRef = inject<DialogRef<string | null>>(DialogRef);
  private readonly data = inject<RenameTemplateDialogData>(DIALOG_DATA);

  readonly name = new FormControl(this.data.name, { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] });

  save(): void {
    const name = this.name.value.trim();
    if (!name || this.name.invalid) {
      this.name.markAsTouched();
      return;
    }
    this.dialogRef.close(name);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
