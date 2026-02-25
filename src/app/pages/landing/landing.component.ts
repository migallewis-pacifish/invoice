import { Component, inject, signal } from '@angular/core';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { Auth, authState } from '@angular/fire/auth';
import { doc, docData, Firestore, updateDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { take } from 'rxjs';
import { ClientListComponent } from '../client-list/client-list.component';
import { CommonModule } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { UploadTemplateDialogueComponent } from '../../components/upload-template-dialogue/upload-template-dialogue.component';
import { LinkFolderDialogueComponent } from '../../components/link-folder-dialogue/link-folder-dialogue.component';
import { ExpensesComponent } from '../../components/expenses/expenses.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [NavBarComponent, CommonModule, ClientListComponent, ExpensesComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent {
  private auth = inject(Auth);
  private db = inject(Firestore);
  private router = inject(Router);
  private dialog = inject(Dialog);

  companyId = signal<string >("");
  companyName = signal<string | null>(null);
  templatePath = signal<string | null>(null);
  activeTab = signal<TabKey>('invoices');

  loading = signal(true);

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
      const typedResult = result as { provider: 'local' | 'google' | 'onedrive' | null; path: string | null; } | null;
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

  setTab(tab: TabKey) {
    this.activeTab.set(tab);
  }

}

type TabKey = 'invoices' | 'expenses';
