import { Component, inject, signal } from '@angular/core';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';
import { Auth, authState } from '@angular/fire/auth';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { take } from 'rxjs';
import { ClientListComponent } from '../client-list/client-list.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [NavBarComponent, CommonModule, ClientListComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent {
  private auth = inject(Auth);
  private db = inject(Firestore);
  private router = inject(Router);

  companyId = signal<string | null>(null);
  companyName = signal<string | null>(null);
  templatePath = signal<string | null>(null);

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

}
