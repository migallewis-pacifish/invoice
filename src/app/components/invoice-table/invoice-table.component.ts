import { CurrencyPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { InvoiceRecord } from '../../models/invoice.model';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';

@Component({
  selector: 'app-invoice-table',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgFor, NgIf, StatusBadgeComponent],
  templateUrl: './invoice-table.component.html',
  styleUrl: './invoice-table.component.scss'
})
export class InvoiceTableComponent {
  @Input() invoices: InvoiceRecord[] = [];
  @Input() currency = 'ZAR';
  @Input() limit?: number;
  @Input() compact = false;
  @Input() showPaid = true;
  @Input() statusFor: (invoice: InvoiceRecord) => string = invoice => invoice.status || 'sent';
  @Input() canRemind: (invoice: InvoiceRecord) => boolean = () => true;
  @Input() reminderText: (invoice: InvoiceRecord) => string = () => 'Reminder';
  @Output() viewed = new EventEmitter<InvoiceRecord>();
  @Output() updated = new EventEmitter<InvoiceRecord>();
  @Output() emailed = new EventEmitter<InvoiceRecord>();
  @Output() reminded = new EventEmitter<InvoiceRecord>();
  get visibleInvoices(): InvoiceRecord[] { return this.limit ? this.invoices.slice(0, this.limit) : this.invoices; }
}
