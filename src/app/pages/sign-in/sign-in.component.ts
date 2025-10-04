import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FacebookAuthProvider, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [ReactiveFormsModule,CommonModule],
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.scss'
})
export class SignInComponent {
  private fb = inject(FormBuilder);
  private auth = inject(Auth);

  loading = signal(false);
  error = signal<string | null>(null);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async signInEmail() {
    this.error.set(null);
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const { email, password } = this.form.value;
    this.loading.set(true);
    try {
      await signInWithEmailAndPassword(this.auth, email!, password!);
      // navigate after router guard picks up auth state
    } catch (e: any) {
      this.error.set(e?.message ?? 'Sign in failed');
    } finally {
      this.loading.set(false);
    }
  }

  async signInGoogle() {
    this.error.set(null);
    this.loading.set(true);
    try {
      await signInWithPopup(this.auth, new GoogleAuthProvider());
    } catch (e: any) {
      this.error.set(e?.message ?? 'Google sign in failed');
    } finally {
      this.loading.set(false);
    }
  }

  async signInFacebook() {
    this.error.set(null);
    this.loading.set(true);
    try {
      await signInWithPopup(this.auth, new FacebookAuthProvider());
    } catch (e: any) {
      this.error.set(e?.message ?? 'Facebook sign in failed');
    } finally {
      this.loading.set(false);
    }
  }

  // LinkedIn isn’t a built-in Firebase provider; you’d use Custom Auth later.
  signInLinkedIn() {
    this.error.set('LinkedIn sign-in not configured yet.');
  }
}
