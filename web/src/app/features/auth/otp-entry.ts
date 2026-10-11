import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

const CODE = /^\d{6}$/;

/** Resend countdown in whole seconds; stops itself and clears on destroy. */
export class Cooldown {
  readonly seconds = signal(0);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(destroyRef: DestroyRef) {
    destroyRef.onDestroy(() => clearInterval(this.timer));
  }

  start(seconds: number): void {
    clearInterval(this.timer);
    this.seconds.set(Math.max(0, seconds));
    if (seconds <= 0) return;
    this.timer = setInterval(() => {
      this.seconds.update((s) => Math.max(0, s - 1));
      if (this.seconds() === 0) clearInterval(this.timer);
    }, 1000);
  }
}

/**
 * The "enter the 6-digit code we emailed you" step, shared by signup and the verify-email page.
 * Presentational: the parent sends/checks codes and passes state back in.
 */
@Component({
  selector: 'ah-otp-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  template: `
    <h1>{{ 'auth.verify.title' | translate }}</h1>
    <p class="subtitle">
      {{ 'auth.verify.subtitle' | translate }}
      <!-- Own line, isolated left-to-right, so an address with dashes never wraps or reorders in RTL. -->
      <bdi dir="ltr" class="email">{{ email() }}</bdi>
    </p>

    @if (error()) {
      <div class="alert error" role="alert">{{ error() | translate }}</div>
    }
    @if (notice()) {
      <div class="alert success" role="status">{{ notice() | translate }}</div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="otp-code">{{ 'auth.verify.code' | translate }}</label>
        <input
          id="otp-code"
          class="input ltr otp"
          formControlName="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          (input)="onInput()"
        />
        <span class="hint">{{ 'auth.verify.hint' | translate }}</span>
      </div>
      <button class="btn primary block" type="submit" [disabled]="busy() || form.invalid">
        {{ (busy() ? 'common.pleaseWait' : submitLabel()) | translate }}
      </button>
    </form>

    <p class="footer">
      {{ 'auth.verify.noCode' | translate }}
      <button type="button" class="btn ghost" [disabled]="cooldown() > 0 || sending()" (click)="resend.emit()">
        @if (cooldown() > 0) {
          {{ 'auth.verify.resendIn' | translate: { seconds: cooldown() } }}
        } @else {
          {{ 'auth.verify.resend' | translate }}
        }
      </button>
    </p>
    <p class="footer">
      <button type="button" class="btn ghost" (click)="back.emit()">{{ backLabel() | translate }}</button>
    </p>
  `,
  styleUrl: './auth-form.less',
  styles: `
    .email {
      display: block;
      margin-block-start: 4px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .otp {
      font-size: 1.5rem;
      letter-spacing: 0.5em;
      text-align: center;
    }
  `,
})
export class OtpEntry {
  readonly email = input.required<string>();
  readonly busy = input(false);
  readonly sending = input(false);
  readonly cooldown = input(0);
  readonly error = input<string | null>(null);
  readonly notice = input<string | null>(null);
  readonly submitLabel = input('auth.verify.submit');
  readonly backLabel = input.required<string>();

  readonly codeEntered = output<string>();
  readonly resend = output<void>();
  readonly back = output<void>();

  protected readonly form = inject(NonNullableFormBuilder).group({ code: ['', [Validators.required, Validators.pattern(CODE)]] });

  constructor() {
    // A rejected code is cleared so the next attempt starts fresh.
    effect(() => {
      if (this.error()) this.form.controls.code.setValue('');
    });
  }

  protected onInput(): void {
    const control = this.form.controls.code;
    const digits = control.value.replace(/\D/g, '').slice(0, 6);
    if (digits !== control.value) control.setValue(digits);
    if (CODE.test(digits) && !this.busy()) this.submit();
  }

  protected submit(): void {
    if (this.form.valid) this.codeEntered.emit(this.form.controls.code.value);
  }
}
