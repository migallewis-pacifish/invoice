import { Routes } from '@angular/router';
import { CreateClientComponent } from './pages/create-client/create-client.component';
import { SignInComponent } from './pages/sign-in/sign-in.component';
import { ClientListComponent } from './pages/client-list/client-list.component';
import { RegisterWizardComponent } from './pages/register-wizard/register-wizard.component';

export const routes: Routes = [
  { path: 'login', component: SignInComponent },
  { path: 'register', component: RegisterWizardComponent },

  { path: 'clients/new', component: CreateClientComponent },
  { path: 'clients', component: ClientListComponent }

];
