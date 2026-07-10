import { Component, Input, computed, inject, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
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

  protected readonly signedInUserName = signal('Workspace User');
  protected readonly signedInUserRole = signal('Team Member');
  protected readonly signedInUserInitials = computed(() => this.initialsFor(this.signedInUserName()));

  constructor() {
    this.companyContext.currentContext$().subscribe({
      next: ({ user, profile }) => this.setSignedInUser(user, profile),
      error: () => {
        this.signedInUserName.set('Workspace User');
        this.signedInUserRole.set('Team Member');
      }
    });
  }

  private setSignedInUser(user: { displayName: string | null; email: string | null; }, profile?: AppUser): void {
    const displayName = user.displayName || profile?.email || user.email || 'Workspace User';
    this.signedInUserName.set(displayName);
    this.signedInUserRole.set(this.roleLabel(profile?.role));
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
