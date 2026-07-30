import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  Auth,
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup
} from '@angular/fire/auth';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { RegisterService } from '../../services/register.service';

export function emailSignInErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-disabled':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      // Do not reveal whether an account exists for the submitted address.
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many unsuccessful attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups and try again.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.scss'
})
export class SignInComponent {
  private fb = inject(FormBuilder);
  private auth = inject(Auth);
  private router = inject(Router);
  private authService = inject(RegisterService);

  loading = signal(false);
  error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });


  async signInEmail() {
    if (this.loading()) return;
    this.error.set(null);
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      await signInWithEmailAndPassword(this.auth, email.trim(), password);
      await this.authService.routeAfterSignIn();
    } catch (error: unknown) {
      this.error.set(emailSignInErrorMessage(error));
    } finally { this.loading.set(false); }
  }

  async signInGoogle() {
    this.error.set(null); this.loading.set(true);
    try {
      await signInWithPopup(this.auth, new GoogleAuthProvider());
      await this.authService.routeAfterSignIn();
    } catch (e: unknown) { this.error.set(emailSignInErrorMessage(e)); }
    finally { this.loading.set(false); }
  }

  async signInFacebook() {
    this.error.set(null); this.loading.set(true);
    try {
      await signInWithPopup(this.auth, new FacebookAuthProvider());
      await this.authService.routeAfterSignIn();
    } catch (e: unknown) { this.error.set(emailSignInErrorMessage(e)); }
    finally { this.loading.set(false); }
  }

  async signInMicrosoft() {
    this.error.set(null); this.loading.set(true);
    try {
      const provider = new OAuthProvider('microsoft.com');
      // Optional: restrict tenant or add scopes
      // provider.setCustomParameters({ tenant: 'common' }); // or your tenant ID
      provider.addScope('openid'); provider.addScope('email'); provider.addScope('profile');
      await signInWithPopup(this.auth, provider);
      await this.authService.routeAfterSignIn();
    } catch (e: unknown) { this.error.set(emailSignInErrorMessage(e)); }
    finally { this.loading.set(false); }
  }
}
