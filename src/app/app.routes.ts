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

export const routes: Routes = [

  { path: 'login', component: SignInComponent },
  { path: 'register', component: RegisterWizardComponent, canActivate: [authGuard] },

  { path: '', component: LandingComponent, canActivate: [authGuard, companyGuard] },
  { path: 'clients/new', component: CreateClientComponent, canActivate: [authGuard, companyGuard] },
  { path: 'clients', component: ClientListComponent, canActivate: [authGuard, companyGuard] },
  { path: 'template', component: UploadTemplateComponent, canActivate: [authGuard, companyGuard] },
  {
    path: 'client/:id',
    component: ClientDetailComponent,
    canActivate: [authGuard, companyGuard]
  }

];
