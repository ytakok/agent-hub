import type { CustomerSearchField } from '@agency-hub/shared';
import type { CustomerCriteria } from '../integrations/provider.types.js';

// Pure helpers shared by the search service and the mock provider. Live providers should
// compare against values normalized the same way.

const LETTERS = /[A-Za-z֐-׿؀-ۿ]/;

/** Digits only; Israeli international prefix 972 becomes a leading 0 (+972-52-… → 052…). */
export function normalizePhone(value: string): string {
  const d = value.replace(/\D/g, '');
  return d.startsWith('972') ? `0${d.slice(3)}` : d;
}

/** Israeli ID: digits only, left-padded to 9. */
export function normalizeNationalId(value: string): string {
  return value.replace(/\D/g, '').padStart(9, '0');
}

/** Case- and separator-insensitive: "hr-hlt 458821" → "HRHLT458821". */
export function normalizePolicyNumber(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Israeli ID check digit (Luhn variant). */
export function isValidIsraeliId(value: string): boolean {
  const id = normalizeNationalId(value);
  if (!/^\d{9}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(id[i]) * ((i % 2) + 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

/** `*****6787` — keep the last 4 digits. */
export function maskNationalId(value: string | undefined): string {
  if (!value) return '';
  const id = normalizeNationalId(value);
  return `${'*'.repeat(id.length - 4)}${id.slice(-4)}`;
}

/**
 * Turns a free-text term into search criteria. With `by: 'auto'` the term type is detected:
 * - letters + digits      → policy number
 * - letters only          → name
 * - digits only           → policy number, plus phone (0… / 972…, 9–10 digits) and ID (5–9 digits)
 * Ambiguous digit strings search every matching field (OR).
 */
export function buildCriteria(
  q: string,
  by: CustomerSearchField | 'auto' = 'auto',
): { criteria: CustomerCriteria; searchedBy: CustomerSearchField[] } {
  const term = q.trim();
  const criteria: CustomerCriteria = {};

  if (by !== 'auto') {
    if (by === 'nationalId') criteria.nationalId = normalizeNationalId(term);
    if (by === 'phone') criteria.phone = normalizePhone(term);
    if (by === 'policyNumber') criteria.policyNumber = normalizePolicyNumber(term);
    if (by === 'name') criteria.name = normalizeName(term);
    return { criteria, searchedBy: [by] };
  }

  const hasLetters = LETTERS.test(term);
  const digits = term.replace(/\D/g, '');

  if (hasLetters && digits.length) {
    criteria.policyNumber = normalizePolicyNumber(term);
  } else if (hasLetters) {
    criteria.name = normalizeName(term);
  } else if (digits.length >= 4) {
    criteria.policyNumber = digits;
    const phone = normalizePhone(term);
    if ((term.startsWith('+') || digits.startsWith('972') || digits.startsWith('0')) && /^0\d{8,9}$/.test(phone)) {
      criteria.phone = phone;
    }
    if (digits.length >= 5 && digits.length <= 9) criteria.nationalId = normalizeNationalId(digits);
  }

  const searchedBy = (['nationalId', 'phone', 'policyNumber', 'name'] as const).filter((f) => criteria[f] !== undefined);
  return { criteria, searchedBy };
}
