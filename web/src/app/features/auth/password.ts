import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const PASSWORD_RULES = [
  { key: 'length', test: (v: string) => v.length >= 10 },
  { key: 'upper', test: (v: string) => /[A-Z]/.test(v) },
  { key: 'lower', test: (v: string) => /[a-z]/.test(v) },
  { key: 'digit', test: (v: string) => /\d/.test(v) },
  { key: 'symbol', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

/** Mirror this policy in Firebase console → Authentication → Settings → Password policy (enforced server-side). */
export const strongPassword: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = String(c.value ?? '');
  const failed = PASSWORD_RULES.filter((r) => !r.test(v)).map((r) => r.key);
  return failed.length ? { weakPassword: failed } : null;
};

export function matchFields(a: string, b: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null =>
    group.get(a)?.value === group.get(b)?.value ? null : { mismatch: true };
}

export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,30}$/;
