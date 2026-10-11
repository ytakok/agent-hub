import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, authErrorKey } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { Cooldown, OtpEntry } from './otp-entry';

/**
 * Fallback for accounts that exist in Firebase Auth but aren't verified (older accounts, or created outside the app).
 * New signups never land here: they confirm the code before the account is created.
 */
@Component({
  selector: 'ah-verify-email-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OtpEntry],
  template: `
    <ah-otp-entry
      [email]="auth.user()?.email ?? ''"
      [busy]="busy()"
      [sending]="sending()"
      [cooldown]="cooldown.seconds()"
      [error]="error()"
      [notice]="notice()"
      backLabel="auth.verify.otherAccount"
      (codeEntered)="verify($event)"
      (resend)="send(true)"
      (back)="auth.logout()"
    />
  `,
})
export class VerifyEmailPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  protected readonly busy = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly cooldown = new Cooldown(inject(DestroyRef));

  constructor() {
    // If a code was sent recently, the server just reports the remaining wait instead of sending again.
    void this.send(false);
  }

  protected async send(userAsked: boolean): Promise<void> {
    this.sending.set(true);
    this.error.set(null);
    try {
      const status = await this.auth.sendEmailOtp(this.language.lang());
      if (status.verified) {
        await this.continue();
        return;
      }
      if (userAsked && status.expiresInSeconds) this.notice.set('auth.verify.sent');
      this.cooldown.start(status.retryAfterSeconds ?? 0);
    } catch (e) {
      const throttled = (e as { status?: number }).status === 429;
      this.error.set(throttled ? 'auth.errors.tooManyRequests' : 'auth.verify.sendFailed');
      if (throttled) this.cooldown.start(60);
    } finally {
      this.sending.set(false);
    }
  }

  protected async verify(code: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.auth.verifyEmailOtp(code);
      await this.continue();
    } catch (e) {
      this.error.set(authErrorKey(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** The app guard sends users without an organization to onboarding. */
  private continue(): Promise<boolean> {
    return this.router.navigateByUrl('/app/dashboard');
  }
}
