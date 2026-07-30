import { ComponentFixture, TestBed } from '@angular/core/testing';

import { emailSignInErrorMessage, SignInComponent } from './sign-in.component';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { RegisterService } from '../../services/register.service';

describe('SignInComponent', () => {
  let component: SignInComponent;
  let fixture: ComponentFixture<SignInComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignInComponent]
      , providers: [
        { provide: Auth, useValue: {} },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: RegisterService, useValue: { routeAfterSignIn: jasmine.createSpy('routeAfterSignIn') } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SignInComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('requires a password without imposing a registration password policy', () => {
    component.form.setValue({ email: 'owner@example.com', password: 'short' });

    expect(component.form.valid).toBeTrue();
  });

  it('does not disclose whether an account exists for credential errors', () => {
    expect(emailSignInErrorMessage({ code: 'auth/user-not-found' })).toBe('Invalid email or password.');
    expect(emailSignInErrorMessage({ code: 'auth/wrong-password' })).toBe('Invalid email or password.');
  });

  it('returns actionable messages for throttling and network errors', () => {
    expect(emailSignInErrorMessage({ code: 'auth/too-many-requests' })).toContain('wait a moment');
    expect(emailSignInErrorMessage({ code: 'auth/network-request-failed' })).toContain('connection');
  });
});
