import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService, authErrorKey } from '../../core/auth/auth.service';
import { matchFields, strongPassword } from './password';

type View = 'loading' | 'reset' | 'done' | 'verified' | 'error';

/**
 * Handles Firebase email action links: /auth/action?mode=resetPassword|verifyEmail&oobCode=…
 * Set this URL as the custom action URL in Firebase console → Authentication → Templates.
 */
@Component({
  selector: 'ah-auth-action-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  template: `
    @switch (view()) {
      @case ('loading') {
        <p role="status">{{ 'common.loading' | translate }}</p>
      }
      @case ('reset') {
        <h1>{{ 'auth.reset.title' | translate }}</h1>
        <p class="subtitle">{{ 'auth.reset.subtitle' | translate: { email: email() } }}</p>
        @if (error()) {
          <div class="alert error" role="alert">{{ error() | translate }}</div>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label for="password">{{ 'auth.fields.newPassword' | translate }}</label>
            <input id="password" type="password" class="input ltr" formControlName="password" autocomplete="new-password" />
            @if (form.controls.password.touched && form.controls.password.invalid) {
              <span class="error">{{ 'validation.weakPassword' | translate }}</span>
            }
            <span class="hint">{{ 'auth.hints.password' | translate }}</span>
          </div>
          <div class="field">
            <label for="confirm">{{ 'auth.fields.confirmPassword' | translate }}</label>
            <input id="confirm" type="password" class="input ltr" formControlName="confirm" autocomplete="new-password" />
            @if (form.controls.confirm.touched && form.hasError('mismatch')) {
              <span class="error">{{ 'validation.mismatch' | translate }}</span>
            }
          </div>
          <button class="btn primary block" type="submit" [disabled]="busy()">{{ 'auth.reset.submit' | translate }}</button>
        </form>
      }
      @case ('done') {
        <div class="alert success" role="status">{{ 'auth.reset.done' | translate }}</div>
        <a class="btn primary block" routerLink="/auth/login">{{ 'auth.backToLogin' | translate }}</a>
      }
      @case ('verified') {
        <div class="alert success" role="status">{{ 'auth.verify.done' | translate }}</div>
        <a class="btn primary block" routerLink="/app/dashboard">{{ 'auth.verify.continue' | translate }}</a>
      }
      @case ('error') {
        <div class="alert error" role="alert">{{ error() | translate }}</div>
        <a class="btn ghost block" routerLink="/auth/forgot-password">{{ 'auth.reset.requestNew' | translate }}</a>
      }
    }
  `,
  styleUrl: './auth-form.less',
})
export class AuthActionPage implements OnInit {
  private readonly auth = inject(AuthService);
  readonly mode = input<string>();
  readonly oobCode = input<string>();

  protected readonly view = signal<View>('loading');
  protected readonly email = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group(
    { password: ['', [Validators.required, strongPassword]], confirm: ['', Validators.required] },
    { validators: matchFields('password', 'confirm') },
  );

  async ngOnInit(): Promise<void> {
    const code = this.oobCode();
    if (!code) return this.fail('auth.errors.linkInvalid');
    try {
      if (this.mode() === 'resetPassword') {
        this.email.set(await this.auth.verifyResetCode(code));
        this.view.set('reset');
      } else if (this.mode() === 'verifyEmail') {
        await this.auth.verifyEmail(code);
        this.view.set('verified');
      } else {
        this.fail('auth.errors.linkInvalid');
      }
    } catch (e) {
      this.fail(authErrorKey(e));
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.confirmReset(this.oobCode()!, this.form.getRawValue().password);
      this.view.set('done');
    } catch (e) {
      this.error.set(authErrorKey(e));
    } finally {
      this.busy.set(false);
    }
  }

  private fail(key: string): void {
    this.error.set(key);
    this.view.set('error');
  }
}
