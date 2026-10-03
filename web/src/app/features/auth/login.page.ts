import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService, authErrorKey } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';
import { Icon } from '../../shared/ui/icon';

@Component({
  selector: 'ah-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, Icon],
  template: `
    <h1>{{ 'auth.login.title' | translate }}</h1>
    <p class="subtitle">{{ 'auth.login.subtitle' | translate }}</p>

    @if (error()) {
      <div class="alert error" role="alert">{{ error() | translate }}</div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="identifier">{{ (allowUsername() ? 'auth.fields.emailOrUsername' : 'auth.fields.email') | translate }}</label>
        <input id="identifier" class="input ltr" formControlName="identifier" autocomplete="username" autocapitalize="off" spellcheck="false" />
        @if (form.controls.identifier.touched && form.controls.identifier.invalid) {
          <span class="error">{{ 'validation.required' | translate }}</span>
        }
      </div>

      <div class="field">
        <label for="password">{{ 'auth.fields.password' | translate }}</label>
        <div class="password-wrap">
          <input id="password" class="input ltr" [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" />
          <button type="button" class="reveal" (click)="showPassword.set(!showPassword())" [attr.aria-label]="'auth.togglePassword' | translate" [attr.aria-pressed]="showPassword()">
            <ah-icon [name]="showPassword() ? 'eyeOff' : 'eye'" [size]="18" />
          </button>
        </div>
      </div>

      <div class="row">
        <span></span>
        <a routerLink="/auth/forgot-password">{{ 'auth.login.forgot' | translate }}</a>
      </div>

      <button class="btn primary block" type="submit" [disabled]="busy()">
        {{ (busy() ? 'common.pleaseWait' : 'auth.login.submit') | translate }}
      </button>
    </form>

    @if (theme.theme()?.auth?.google) {
      <div class="divider">{{ 'auth.or' | translate }}</div>
      <button class="btn ghost block" type="button" (click)="google()" [disabled]="busy()">
        <ah-icon name="google" [size]="18" /> {{ 'auth.login.google' | translate }}
      </button>
    }

    @if (theme.theme()?.auth?.signup) {
      <p class="footer">
        {{ 'auth.login.noAccount' | translate }} <a routerLink="/auth/signup">{{ 'auth.login.signupLink' | translate }}</a>
      </p>
    }
  `,
  styleUrl: './auth-form.less',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  /** Bound from ?returnUrl= via withComponentInputBinding. */
  readonly returnUrl = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    identifier: ['', [Validators.required, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly allowUsername = computed(() => this.theme.theme()?.auth.usernameLogin ?? true);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { identifier, password } = this.form.getRawValue();
    if (!this.allowUsername() && !identifier.includes('@')) {
      this.error.set('auth.errors.invalidEmail');
      return;
    }
    await this.run(() => this.auth.login(identifier, password));
  }

  protected google(): Promise<void> {
    return this.run(() => this.auth.loginWithGoogle());
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.router.navigateByUrl(this.auth.needsOnboarding() ? '/auth/complete-profile' : this.safeReturnUrl());
    } catch (e) {
      this.error.set(authErrorKey(e));
      this.form.controls.password.reset();
    } finally {
      this.busy.set(false);
    }
  }

  /** Only same-app paths — prevents open redirects via ?returnUrl=https://evil. */
  private safeReturnUrl(): string {
    const url = this.returnUrl();
    return url && url.startsWith('/app/') && !url.startsWith('//') ? url : '/app/dashboard';
  }
}
