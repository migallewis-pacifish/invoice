import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FacebookAuthProvider, GoogleAuthProvider, OAuthProvider, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { RegisterService } from '../../services/register.service';

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

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });


  async signInEmail() {
    this.error.set(null);
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    try {
      const { email, password } = this.form.value;
      await signInWithEmailAndPassword(this.auth, email!, password!);
      await this.authService.routeAfterSignIn();
    } catch (e: any) {
      this.error.set(this.mapError(e));
    } finally { this.loading.set(false); }
  }

  async signInGoogle() {
    this.error.set(null); this.loading.set(true);
    try {
      await signInWithPopup(this.auth, new GoogleAuthProvider());
      await this.authService.routeAfterSignIn();
    } catch (e: any) { this.error.set(this.mapError(e)); }
    finally { this.loading.set(false); }
  }

  async signInFacebook() {
    this.error.set(null); this.loading.set(true);
    try {
      await signInWithPopup(this.auth, new FacebookAuthProvider());
      await this.authService.routeAfterSignIn();
    } catch (e: any) { this.error.set(this.mapError(e)); }
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
    } catch (e: any) { this.error.set(this.mapError(e)); }
    finally { this.loading.set(false); }
  }

  private mapError(e: any): string {
    const code = e?.code || '';
    if (code.includes('email-already-in-use')) return 'This email is already in use.';
    if (code.includes('invalid-credential')) return 'Invalid email or password.';
    if (code.includes('popup-closed-by-user')) return 'Sign-in popup was closed.';
    if (code.includes('network-request-failed')) return 'Network error. Please try again.';
    return e?.message || 'Sign-in failed.';
  }
}
