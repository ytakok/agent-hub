import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService, authErrorKey } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { USERNAME_PATTERN } from './password';

/** Onboarding for accounts without an organization yet — typically a first Google sign-in. */
@Component({
  selector: 'ah-complete-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  template: `
    <h1>{{ 'auth.onboarding.title' | translate }}</h1>
    <p class="subtitle">{{ 'auth.onboarding.subtitle' | translate }}</p>
    @if (error()) {
      <div class="alert error" role="alert">{{ error() | translate }}</div>
    }
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="displayName">{{ 'auth.fields.fullName' | translate }}</label>
        <input id="displayName" class="input" formControlName="displayName" autocomplete="name" />
      </div>
      <div class="field">
        <label for="username">{{ 'auth.fields.username' | translate }}</label>
        <input id="username" class="input ltr" formControlName="username" autocapitalize="off" spellcheck="false" />
        @if (form.controls.username.touched && form.controls.username.invalid) {
          <span class="error">{{ 'validation.username' | translate }}</span>
        }
      </div>
      <div class="field">
        <label for="companyName">{{ 'auth.fields.company' | translate }}</label>
        <input id="companyName" class="input" formControlName="companyName" autocomplete="organization" />
      </div>
      <div class="field">
        <label for="inviteCode">{{ 'auth.fields.inviteCode' | translate }}</label>
        <input id="inviteCode" class="input ltr" formControlName="inviteCode" autocomplete="off" />
        <span class="hint">{{ 'auth.hints.inviteCode' | translate }}</span>
      </div>
      <button class="btn primary block" type="submit" [disabled]="busy()">
        {{ (busy() ? 'common.pleaseWait' : 'auth.onboarding.submit') | translate }}
      </button>
    </form>
    <p class="footer"><button type="button" class="btn ghost" (click)="auth.logout()">{{ 'nav.logout' | translate }}</button></p>
  `,
  styleUrl: './auth-form.less',
})
export class CompleteProfilePage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  protected readonly form = inject(NonNullableFormBuilder).group({
    displayName: [this.auth.user()?.displayName ?? '', [Validators.required, Validators.minLength(2)]],
    username: ['', [Validators.required, Validators.pattern(USERNAME_PATTERN)]],
    companyName: [''],
    inviteCode: [''],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    const v = this.form.getRawValue();
    if (this.form.invalid || (!v.companyName && !v.inviteCode)) {
      this.form.markAllAsTouched();
      if (!v.companyName && !v.inviteCode) this.error.set('auth.onboarding.needCompanyOrInvite');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.bootstrap({
        displayName: v.displayName,
        username: v.username,
        language: this.language.lang(),
        ...(v.inviteCode ? { inviteCode: v.inviteCode.trim() } : { companyName: v.companyName }),
      });
      await this.router.navigateByUrl('/app/dashboard');
    } catch (e) {
      this.error.set(authErrorKey(e));
    } finally {
      this.busy.set(false);
    }
  }
}
