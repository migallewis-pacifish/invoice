import { Routes } from '@angular/router';
import { CreateClientComponent } from './components/create-client/create-client.component';
import { SignInComponent } from './pages/sign-in/sign-in.component';
import { ClientListComponent } from './pages/client-list/client-list.component';
import { RegisterWizardComponent } from './pages/register-wizard/register-wizard.component';
import { LandingComponent } from './pages/landing/landing.component';
import { authGuard } from './utils/authGuard';
import { companyGuard } from './utils/companyGuard';
import { UploadTemplateComponent } from './pages/upload-template/upload-template.component';
import { ClientDetailComponent } from './pages/client-detail/client-detail.component';
import { MembershipPlanComponent } from './libraries/membership-plan/membership-plan.component';
import { PlaceholderPageComponent } from './pages/placeholder/placeholder-page.component';
import { TemplatesComponent } from './pages/templates/templates.component';

const companyRoutes = [authGuard, companyGuard];

export const routes: Routes = [
  { path: 'login', component: SignInComponent },
  { path: 'register', component: RegisterWizardComponent, canActivate: [authGuard] },

  { path: '', component: LandingComponent, canActivate: companyRoutes },
  { path: 'company-details', component: PlaceholderPageComponent, canActivate: companyRoutes, data: { sectionName: 'Company Details' } },
  { path: 'clients/new', component: CreateClientComponent, canActivate: companyRoutes },
  { path: 'clients', component: ClientListComponent, canActivate: companyRoutes },
  { path: 'templates', component: TemplatesComponent, canActivate: companyRoutes },
  { path: 'template', redirectTo: 'templates' },
  { path: 'company-expenses', component: PlaceholderPageComponent, canActivate: companyRoutes, data: { sectionName: 'Company Expenses' } },
  { path: 'bank-statements', component: PlaceholderPageComponent, canActivate: companyRoutes, data: { sectionName: 'Bank Statement Uploads' } },
  { path: 'settings', component: PlaceholderPageComponent, canActivate: companyRoutes, data: { sectionName: 'Settings' } },
  {
    path: 'company/:companyId/client/:clientId',
    component: ClientDetailComponent,
    canActivate: companyRoutes
  },
  {
    path: 'membership',
    component: MembershipPlanComponent
  },
  { path: '**', redirectTo: '' }
];
