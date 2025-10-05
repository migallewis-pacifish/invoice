import { Component, inject } from '@angular/core';
import { ClientService } from '../../services/client.service';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Client } from '../../models/invoice.model';
import { combineLatest, map, Observable, of, startWith } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-client-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './client-list.component.html',
  styleUrl: './client-list.component.scss'
})
export class ClientListComponent {
  private router = inject(Router);
  private clientSvc = inject(ClientService);

  // search/filter
  search = new FormControl('', { nonNullable: true });
  clients$: Observable<Client[]>;

  filtered$: Observable<Client[]>;

  constructor() {
    this.clients$ = of([]);
    this.filtered$ = of([]);
  }

  ngOnInit(): void {
    this.clients$ = this.clientSvc.clients$();
    this.filtered$ = combineLatest([
      this.clients$,
      this.search.valueChanges.pipe(startWith(''))
    ]).pipe(
      map(([clients, term]) => {
        const t = (term || '').trim().toLowerCase();
        if (!t) return clients;
        return clients.filter(c =>
          (c.displayName || '').toLowerCase().includes(t) ||
          (c.email || '').toLowerCase().includes(t) ||
          (c.phone || '').toLowerCase().includes(t)
        );
      })
    );
  }

  goNew() { this.router.navigate(['/clients/new']); }
  goClient(c: Client) { this.router.navigate(['/clients', c.id]); }           // you can create this route later
  createInvoice(c: Client) { this.router.navigate(['/invoice/once-off'], { state: { clientId: c.id } }); }
}
