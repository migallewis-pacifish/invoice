import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MembershipPlansComponent, MembershipPlan } from '@faithlee/membership';


@Component({
  selector: 'app-membership-plan',
  standalone: true,
  imports: [MembershipPlansComponent],
  templateUrl: './membership-plan.component.html',
  styleUrl: './membership-plan.component.scss'
})
export class MembershipPlanComponent {

constructor(private router: Router) {}

  plans = signal<MembershipPlan[]>([
    {
      id: 'basic',
      name: 'Basic',
      description: 'For individuals getting started with invoicing.',
      isPopular: false,
      billing: [
        { cycle: 'monthly', amount: 99 },
        { cycle: 'yearly', amount: 79, discount: 20, originalAmount: 99 }
      ],
      features: [
        { key: 'create', label: 'Create invoices', included: true },
        { key: 'send', label: 'Send invoices via email', included: true },
        { key: 'pdf', label: 'Generate PDF invoices', included: true },
        { key: 'payments', label: 'Track payments', included: false },
        { key: 'recurring', label: 'Recurring invoices', included: false },
        { key: 'multiCurrency', label: 'Multi-currency support', included: false },
        { key: 'team', label: 'Team access', included: false },
        { key: 'reports', label: 'Advanced reporting', included: false },
      ],
    },
    {
      id: 'pro',
      name: 'Pro',
      description: 'For growing businesses who need more invoicing tools.',
      isPopular: true,
      billing: [
        { cycle: 'monthly', amount: 199 },
        { cycle: 'yearly', amount: 159, discount: 20, originalAmount: 199 },
      ],
      features: [
        { key: 'create', label: 'Create invoices', included: true },
        { key: 'send', label: 'Send invoices via email', included: true },
        { key: 'pdf', label: 'Generate PDF invoices', included: true },
        { key: 'payments', label: 'Track payments', included: true },
        { key: 'recurring', label: 'Recurring invoices', included: true },
        { key: 'multiCurrency', label: 'Multi-currency support', included: true },
        { key: 'team', label: 'Team access', included: true, limit: 'Up to 3 users' },
        { key: 'reports', label: 'Advanced reporting', included: false },
      ],
    },
    {
      id: 'premium',
      name: 'Premium',
      description: 'Best for professionals and larger teams.',
      isPopular: false,
      billing: [
        { cycle: 'monthly', amount: 349 },
        { cycle: 'yearly', amount: 289, discount: 17, originalAmount: 349 },
      ],
      features: [
        { key: 'create', label: 'Create invoices', included: true },
        { key: 'send', label: 'Send invoices via email', included: true },
        { key: 'pdf', label: 'Generate PDF invoices', included: true },
        { key: 'payments', label: 'Track payments', included: true },
        { key: 'recurring', label: 'Recurring invoices', included: true },
        { key: 'multiCurrency', label: 'Multi-currency support', included: true },
        { key: 'team', label: 'Team access', included: true, limit: 'Up to 10 users' },
        { key: 'reports', label: 'Advanced reporting', included: true },
        { key: 'prioritySupport', label: 'Priority email support', included: true },
      ],
    },
  ]);

  onPlanSelected(plan: MembershipPlan) {
    this.router.navigate(['/dashboard']);
  }

}

