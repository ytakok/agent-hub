import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService, authErrorKey } from '../../core/auth/auth.service';

@Component({
  selector: 'ah-forgot-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  template: `
    <h1>{{ 'auth.forgot.title' | translate }}</h1>
    <p class="subtitle">{{ 'auth.forgot.subtitle' | translate }}</p>

    @if (sent()) {
      <!-- Same message whether or not the account exists. -->
      <div class="alert success" role="status">{{ 'auth.forgot.sent' | translate }}</div>
    } @else {
      @if (error()) {
        <div class="alert error" role="alert">{{ error() | translate }}</div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="email">{{ 'auth.fields.email' | translate }}</label>
          <input id="email" type="email" class="input" formControlName="email" autocomplete="email" />
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <span class="error">{{ 'validation.email' | translate }}</span>
          }
        </div>
        <button class="btn primary block" type="submit" [disabled]="busy()">
          {{ (busy() ? 'common.pleaseWait' : 'auth.forgot.submit') | translate }}
        </button>
      </form>
    }
    <p class="footer"><a routerLink="/auth/login">{{ 'auth.backToLogin' | translate }}</a></p>
  `,
  styleUrl: './auth-form.less',
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);
  protected readonly form = inject(NonNullableFormBuilder).group({ email: ['', [Validators.required, Validators.email]] });
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.forgotPassword(this.form.getRawValue().email);
      this.sent.set(true);
    } catch (e) {
      this.error.set(authErrorKey(e));
    } finally {
      this.busy.set(false);
    }
  }
}
