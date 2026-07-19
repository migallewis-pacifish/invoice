import { Component, DestroyRef, Input, computed, inject, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { User } from '@angular/fire/auth';
import { AppUser } from '../../models/invoice.model';
import { CompanyContextService } from '../../services/company-context.service';

@Component({
  selector: 'app-workspace-topbar',
  standalone: true,
  imports: [NgIf, ReactiveFormsModule],
  templateUrl: './workspace-topbar.component.html',
  styleUrl: './workspace-topbar.component.scss'
})
export class WorkspaceTopbarComponent {
  @Input() searchControl?: FormControl<string>;
  @Input() searchPlaceholder = 'Search workspace, clients, invoices...';

  private readonly companyContext = inject(CompanyContextService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly signedInUserName = signal('Workspace User');
  protected readonly signedInUserRole = signal('Team Member');
  protected readonly signedInUserInitials = computed(() => this.initialsFor(this.signedInUserName()));

  constructor() {
    this.companyContext.currentUser$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(user => this.setSignedInUser(user));

    this.companyContext.currentProfile$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(profile => this.signedInUserRole.set(this.roleLabel(profile?.role)));
  }

  private setSignedInUser(user: User | null): void {
    this.signedInUserName.set(user?.displayName || user?.email || 'Workspace User');
  }

  private roleLabel(role?: AppUser['role']): string {
    if (!role) return 'Team Member';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  private initialsFor(name: string): string {
    const source = name.includes('@') ? name.split('@')[0] : name;
    const parts = source.split(/[\s._-]+/).filter(Boolean);
    const initials = parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
    return initials || 'WU';
  }
}
