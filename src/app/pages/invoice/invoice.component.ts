import { Component } from '@angular/core';
import { InvoiceDocxService } from '../../services/invoice-docx.service';

@Component({
  selector: 'app-invoice',
  standalone: true,
  imports: [],
  templateUrl: './invoice.component.html',
  styleUrl: './invoice.component.scss'
})
export class InvoiceComponent {
  constructor(private invoiceDocxService: InvoiceDocxService) {}

  async download() {
    this.invoiceDocxService.generateAndDownload('',{
      invoice_number: 'DHI-1001',
      invoice_date: new Date().toISOString().slice(0,10),
      client_name: 'Sample Client (Pty) Ltd',
      client_building: 'Suite 5, Block A',
      client_street: '123 Client Street',
      client_suburb: 'Sandton',
      client_city: 'Johannesburg',
      client_post_code: '2196',
      client_contact_no: '+27 11 123 4567',
      services_rendered: 'Legal Services',
      notes: 'Client tends to pay on the 1st.',
      client_email: 'accounts@client.co.za',
      reference: 'PO-4567',

      items: [
        { description: 'Consultation', rate:'300', hours: '2' },
        { description: 'Drafting of Letter of Demand', rate: '1800', hours: '1' },
      ],
    }).subscribe(filename => {
      if (filename) {
        console.log('Invoice created:', filename);
      }
    });
  }
}
