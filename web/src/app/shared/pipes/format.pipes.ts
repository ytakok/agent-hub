import { Pipe, type PipeTransform } from '@angular/core';

// Pure pipes that take the locale as an argument, so they re-run when the language changes.

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

@Pipe({ name: 'relTime' })
export class RelativeTimePipe implements PipeTransform {
  transform(iso: string | undefined, locale: string): string {
    if (!iso) return '';
    const diff = new Date(iso).getTime() - Date.now();
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
    for (const [unit, ms] of UNITS) {
      if (Math.abs(diff) >= ms || unit === 'minute') return rtf.format(Math.round(diff / ms), unit);
    }
    return '';
  }
}

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number, locale: string, currency = 'ILS'): string {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  }
}

@Pipe({ name: 'num' })
export class NumberPipe implements PipeTransform {
  transform(value: number, locale: string): string {
    return new Intl.NumberFormat(locale).format(value);
  }
}

@Pipe({ name: 'shortDate' })
export class ShortDatePipe implements PipeTransform {
  transform(iso: string, locale: string): string {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(iso));
  }
}

/** Whole days from now until the date (negative = past). */
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}
