import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NavBarComponent } from '../../components/nav-bar/nav-bar.component';

@Component({
  selector: 'app-placeholder-page',
  standalone: true,
  imports: [CommonModule, RouterLink, NavBarComponent],
  template: `
    <app-nav-bar></app-nav-bar>
    <main class="placeholder-wrap">
      <nav class="crumbs"><a routerLink="/">Company</a> / {{ sectionName }}</nav>
      <section class="card">
        <h1>{{ sectionName }}</h1>
        <!-- TODO: Implement the full {{ sectionName }} workflow once requirements are finalized. -->
        <p>This section will manage {{ sectionName }}.</p>
      </section>
    </main>
  `,
  styles: [`
    .placeholder-wrap { max-width: 1100px; margin: 24px auto; padding: 0 20px; }
    .crumbs { margin-bottom: 16px; color: #64748b; }
    .crumbs a { color: #2563eb; text-decoration: none; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; box-shadow: 0 8px 30px rgba(15, 23, 42, .06); }
    h1 { margin-top: 0; }
  `]
})
export class PlaceholderPageComponent {
  private route = inject(ActivatedRoute);
  sectionName = this.route.snapshot.data['sectionName'] ?? 'this section';
}
