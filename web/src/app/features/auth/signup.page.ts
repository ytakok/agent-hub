import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService, authErrorKey } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { Icon } from '../../shared/ui/icon';
import { PASSWORD_RULES, USERNAME_PATTERN, matchFields, strongPassword } from './password';

@Component({
  selector: 'ah-signup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, Icon],
  template: `
    <h1>{{ 'auth.signup.title' | translate }}</h1>
    <p class="subtitle">{{ 'auth.signup.subtitle' | translate }}</p>

    @if (error()) {
      <div class="alert error" role="alert">{{ error() | translate }}</div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="displayName">{{ 'auth.fields.fullName' | translate }}</label>
        <input id="displayName" class="input" formControlName="displayName" autocomplete="name" />
      </div>
      <div class="field">
        <label for="companyName">{{ 'auth.fields.company' | translate }}</label>
        <input id="companyName" class="input" formControlName="companyName" autocomplete="organization" />
      </div>
      <div class="field">
        <label for="username">{{ 'auth.fields.username' | translate }}</label>
        <input id="username" class="input ltr" formControlName="username" autocomplete="username" autocapitalize="off" spellcheck="false" />
        <span class="hint">{{ 'auth.hints.username' | translate }}</span>
        @if (form.controls.username.touched && form.controls.username.invalid) {
          <span class="error">{{ 'validation.username' | translate }}</span>
        }
      </div>
      <div class="field">
        <label for="email">{{ 'auth.fields.email' | translate }}</label>
        <input id="email" type="email" class="input" formControlName="email" autocomplete="email" />
        @if (form.controls.email.touched && form.controls.email.invalid) {
          <span class="error">{{ 'validation.email' | translate }}</span>
        }
      </div>
      <div class="field">
        <label for="password">{{ 'auth.fields.password' | translate }}</label>
        <div class="password-wrap">
          <input id="password" class="input ltr" [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="new-password" aria-describedby="pw-rules" />
          <button type="button" class="reveal" (click)="showPassword.set(!showPassword())" [attr.aria-label]="'auth.togglePassword' | translate">
            <ah-icon [name]="showPassword() ? 'eyeOff' : 'eye'" [size]="18" />
          </button>
        </div>
        <ul class="checks" id="pw-rules">
          @for (rule of rules; track rule.key) {
            <li [class.ok]="rule.test(password())"><ah-icon [name]="rule.test(password()) ? 'check' : 'lock'" [size]="12" />{{ 'auth.passwordRules.' + rule.key | translate }}</li>
          }
        </ul>
      </div>
      <div class="field">
        <label for="confirm">{{ 'auth.fields.confirmPassword' | translate }}</label>
        <input id="confirm" class="input ltr" type="password" formControlName="confirm" autocomplete="new-password" />
        @if (form.controls.confirm.touched && form.hasError('mismatch')) {
          <span class="error">{{ 'validation.mismatch' | translate }}</span>
        }
      </div>
      <label class="checkbox">
        <input type="checkbox" formControlName="terms" />
        <span>{{ 'auth.signup.terms' | translate }}</span>
      </label>
      <button class="btn primary block" type="submit" [disabled]="busy()">
        {{ (busy() ? 'common.pleaseWait' : 'auth.signup.submit') | translate }}
      </button>
    </form>

    <p class="footer">{{ 'auth.signup.haveAccount' | translate }} <a routerLink="/auth/login">{{ 'auth.signup.loginLink' | translate }}</a></p>
  `,
  styleUrl: './auth-form.less',
})
export class SignupPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  protected readonly rules = PASSWORD_RULES;

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      companyName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      username: ['', [Validators.required, Validators.pattern(USERNAME_PATTERN)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      password: ['', [Validators.required, strongPassword]],
      confirm: ['', Validators.required],
      terms: [false, Validators.requiredTrue],
    },
    { validators: matchFields('password', 'confirm') },
  );
  protected readonly password = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const v = this.form.getRawValue();
      await this.auth.signup({ ...v, language: this.language.lang() });
      await this.router.navigateByUrl('/app/dashboard');
    } catch (e) {
      this.error.set(authErrorKey(e));
    } finally {
      this.busy.set(false);
    }
  }
}
