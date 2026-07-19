import { NgIf } from '@angular/common';
import { Component, HostBinding, Input } from '@angular/core';
import { FormControl } from '@angular/forms';
import { NavBarComponent } from '../nav-bar/nav-bar.component';
import { WorkspaceTopbarComponent } from '../workspace-topbar/workspace-topbar.component';

@Component({
  selector: 'app-workspace-shell',
  standalone: true,
  imports: [NgIf, NavBarComponent, WorkspaceTopbarComponent],
  template: `
    <app-nav-bar *ngIf="showNav"></app-nav-bar>
    <app-workspace-topbar
      [class]="topbarClass"
      [searchControl]="searchControl"
      [searchPlaceholder]="searchPlaceholder">
    </app-workspace-topbar>
    <ng-content></ng-content>
  `,
  styles: [':host { display: block; }']
})
export class WorkspaceShellComponent {
  @Input() showNav = true;
  @Input() shellClass = 'workspace-shell';
  @Input() topbarClass = '';
  @Input() searchControl?: FormControl<string>;
  @Input() searchPlaceholder = 'Search workspace, clients, invoices...';
  @HostBinding('class') get hostClass(): string { return this.shellClass; }
}
