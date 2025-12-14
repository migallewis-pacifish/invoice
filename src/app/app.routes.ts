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

export const routes: Routes = [

  { path: 'login', component: SignInComponent },
  { path: 'register', component: RegisterWizardComponent },

  { path: '', component: LandingComponent},
  { path: 'clients/new', component: CreateClientComponent},
  { path: 'clients', component: ClientListComponent },
  { path: 'template', component: UploadTemplateComponent },
  {
    path: 'company/:companyId/client/:clientId',
    component: ClientDetailComponent,
  
  },
  {
    path: 'membership',
    component: MembershipPlanComponent
  }

];
