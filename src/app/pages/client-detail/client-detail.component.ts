import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ClientService } from '../../services/client.service';
import { take } from 'rxjs';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './client-detail.component.html',
  styleUrl: './client-detail.component.scss'
})
export class ClientDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private clientSvc = inject(ClientService);

  clientId = signal<string | null>(null);
  client = signal<any | null>(null);
  invoices = signal<any[]>([]);
  loading = signal(true);

  constructor() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (!id) {
        this.router.navigate(['/']);
        return;
      }
      this.clientId.set(id);

      // Subscribe to client data
      this.clientSvc.getClientById(id).pipe(take(1)).subscribe(data => {
        this.client.set(data);
        this.loading.set(false);
      });

      // Real-time invoices
      this.clientSvc.getInvoicesForClient(id).subscribe(list => {
        this.invoices.set(list);
      });
    });
  }

  addInvoice() {
    // Placeholder — will open invoice dialog later
    alert(`Open invoice form for client ${this.clientId()}`);
  }
}
