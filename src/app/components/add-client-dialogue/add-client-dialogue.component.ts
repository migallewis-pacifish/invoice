import { Component, inject } from '@angular/core';
import { DialogRef, DialogModule } from '@angular/cdk/dialog';
import { CreateClientComponent } from '../create-client/create-client.component';

@Component({
  selector: 'app-add-client-dialogue',
  standalone: true,
  imports: [DialogModule, CreateClientComponent],
  templateUrl: './add-client-dialogue.component.html',
  styleUrl: './add-client-dialogue.component.scss'
})
export class AddClientDialogueComponent {
  private dialog = inject(DialogRef<string | null>);

  onSaved(id: string) {
    this.dialog.close(id);
  }

  close() {
    this.dialog.close(null);
  }
}
