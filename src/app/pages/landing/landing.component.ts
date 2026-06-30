import { Component, computed, inject, signal } from '@angular/core';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { Auth, authState } from '@angular/fire/auth';
import { doc, docData, Firestore, updateDoc } from '@angular/fire/firestore';
import { Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { ClientListComponent } from '../client-list/client-list.component';
import { CommonModule } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { UploadTemplateDialogueComponent } from '../../components/upload-template-dialogue/upload-template-dialogue.component';
import { LinkFolderDialogueComponent } from '../../components/link-folder-dialogue/link-folder-dialogue.component';
import { CurrencyService } from '../../services/currency.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [NavBarComponent, CommonModule, ClientListComponent, RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent {
  private auth = inject(Auth);
  private db = inject(Firestore);
  private router = inject(Router);
  private dialog = inject(Dialog);
  private currencyService = inject(CurrencyService);

  companyId = signal<string >("");
  companyName = signal<string | null>(null);
  templatePath = signal<string | null>(null);
  currency = signal(this.currencyService.defaultCurrency);
  currencySymbol = computed(() => this.currencyService.symbolFor(this.currency()));

  loading = signal(true);

  chartMonths = [
    { label: 'Jan', income: 56, expenses: 32 },
    { label: 'Feb', income: 52, expenses: 28 },
    { label: 'Mar', income: 68, expenses: 40 },
    { label: 'Apr', income: 72, expenses: 36 },
    { label: 'May', income: 60, expenses: 48 },
    { label: 'Jun', income: 76, expenses: 24 },
  ];

  recentClients = [
    { name: 'Lumina Digital', status: '3 Active Invoices', initials: '✦', tone: 'mint' },
    { name: 'Vertex Solutions', status: 'Last viewed 2h ago', initials: '◈', tone: 'blue' },
    { name: 'Nova Creative', status: 'Awaiting Payment', initials: '●', tone: 'peach' },
  ];

  upcomingPayments = [
    { name: 'Cloud Server Subscription', meta: 'AWS Infrastructure · Due in 2 days', amount: 1250, icon: '▣', tone: 'red' },
    { name: 'Professional Insurance Premium', meta: 'Allianz · Due in 12 days', amount: 420, icon: '▤', tone: 'green' },
  ];

  activityItems = [
    { title: 'Invoice #4203 Paid', copy: 'Lumina Digital cleared their balance of 3,500.00.', time: 'Today, 10:45 AM', icon: '◉', tone: 'navy' },
    { title: 'New Client Registered', copy: 'Horizon Analytics has been added to your workspace.', time: 'Yesterday, 4:20 PM', icon: '☉', tone: 'light' },
    { title: 'Expense Rejection', copy: 'The expense report for Office Supplies requires review.', time: 'Oct 24, 11:15 AM', icon: '●', tone: 'brown' },
  ];

  constructor() {
    authState(this.auth).pipe(take(1)).subscribe(async (user) => {
      if (!user) { this.router.navigate(['/login']); return; }
      const userRef = doc(this.db, `users/${user.uid}`);
      const userSnap = await docData(userRef).pipe(take(1)).toPromise() as any;
      const companyId = userSnap?.companyId;
      if (!companyId) { this.router.navigate(['/register-company']); return; }

      this.companyId.set(companyId);
      const compRef = doc(this.db, `companies/${companyId}`);
      docData(compRef).subscribe((data: any) => {
        this.companyName.set(data?.name ?? 'Your Company');
        this.templatePath.set(data?.templatePath ?? null);
        this.currency.set(this.currencyService.normalize(data?.currency));
        this.loading.set(false);
      });
    });
  }

  goToUpload() {
    this.router.navigate(['/template']);
  }


  openUploadTemplate() {
    const ref = this.dialog.open<string | null>(UploadTemplateDialogueComponent, {
      hasBackdrop: true,
      disableClose: true,
      backdropClass: 'dlg-backdrop',
      panelClass: 'dlg-panel',
    });

    ref.closed.subscribe(path => {
      if (path) {
        // optional: toast “Template updated ✓”
        // You already subscribe to the company doc, so UI should reflect automatically.
      }
    });
  }


  openLinkFolderDialog() {
    const ref = this.dialog.open(LinkFolderDialogueComponent, {
      backdropClass: 'dlg-backdrop',
      panelClass: 'dlg-panel',
      disableClose: true
    });

    ref.closed.subscribe((result => {
      const typedResult = result as { provider: 'local' | null; path: string | null; } | null;
      if (typedResult) {
        const companyId = this.companyId();
        if (!companyId) return;
        const companyRef = doc(this.db, `companies/${companyId}`);
        updateDoc(companyRef, {
          storageProvider: typedResult.provider ?? null,
          storagePath: typedResult.path ?? null
        }).catch((error) => console.error('Failed to save storage settings', error));
      }
    }));
  }

}
