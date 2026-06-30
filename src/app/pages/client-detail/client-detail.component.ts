import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClientService } from '../../services/client.service';
import { take } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { AddInvoiceDialogComponent } from '../../components/add-invoice-dialog/add-invoice-dialog.component';
import { AddLetterDialogComponent } from '../../components/add-letter-dialog/add-letter-dialog.component';
import { OrderByDateDescPipe } from './order-by-date-desc.pipe';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, NavBarComponent, OrderByDateDescPipe],
  templateUrl: './client-detail.component.html',
  styleUrl: './client-detail.component.scss'
})
export class ClientDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private clientSvc = inject(ClientService);
  private dialog = inject(Dialog);
  
  companyId = signal<string | null>(null);
  clientId = signal<string | null>(null);
  client = signal<any | null>(null);
  invoices = signal<any[]>([]);
  letters = signal<any[]>([]);
  lastInvoice = signal<any | null>(null);
  loading = signal(true);
  activeTab = signal<ClientTab>('details');

  constructor() {
    this.route.paramMap.subscribe(params => {
      const companyId = params.get('companyId');
      const clientId = params.get('clientId');
      if (!clientId || !companyId) {
        this.router.navigate(['/']);
        return;
      }
      this.clientId.set(clientId);
      this.companyId.set(companyId);

      // Subscribe to client data
      this.clientSvc.getClientById(clientId).pipe(take(1)).subscribe(data => {
        this.client.set(data);
        this.loading.set(false);
      });

      // Real-time invoices
      this.clientSvc.getInvoicesForClient(clientId).subscribe(list => {
        this.invoices.set(list);
        this.lastInvoice.set(list.length > 0 ? list[0] : null);
      });

      this.clientSvc.getLettersForClient(clientId).subscribe(list => {
        this.letters.set(list);
      });
    });
  }


addInvoice(previousInvoice: any | null = null, viewOnly = false) {
  const ref = this.dialog.open(AddInvoiceDialogComponent, {
    backdropClass: 'dlg-backdrop',
    panelClass: 'dlg-panel',
    disableClose: true,
    data: {
      client: this.client(),
      clientId: this.clientId(),
      companyId: this.companyId(),
      lastInvoice: this.lastInvoice()?.invoiceNumber,
      previousInvoice,
      viewOnly
    }
  });

  ref.closed.subscribe(filename => {
    if (filename) {
      console.log('Invoice created:', filename);
    }
  });
}

viewInvoice(invoice: any) {
  this.addInvoice(invoice, true);
}

addLetter() {
  const ref = this.dialog.open(AddLetterDialogComponent, {
    backdropClass: 'dlg-backdrop',
    panelClass: 'dlg-panel',
    disableClose: true,
    data: {
      client: this.client(),
      clientId: this.clientId(),
      companyId: this.companyId()
    }
  });

  ref.closed.subscribe(filename => {
    if (filename) {
      console.log('Letter created:', filename);
    }
  });
}

setTab(tab: ClientTab) {
  this.activeTab.set(tab);
}

copyLastInvoice() {
  if (this.lastInvoice()) {
    this.addInvoice(this.lastInvoice());
  }
}

}

type ClientTab = 'details' | 'invoices' | 'expenses' | 'letters';

