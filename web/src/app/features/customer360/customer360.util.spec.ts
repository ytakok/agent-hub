import type { Customer360 } from '@agency-hub/shared';
import { buildTimeline, dueState, isGap, isolateParams, maskForDisplay, whatsappUrl } from './customer360.util';

const DAY = 86_400_000;
const iso = (days: number) => new Date(Date.now() + days * DAY).toISOString();

describe('customer360.util', () => {
  it('masks IDs like the CRM display', () => {
    expect(maskForDisplay('031256787')).toBe('0••••••87');
  });

  it('builds wa.me links from local and international numbers', () => {
    expect(whatsappUrl('052-441-8821')).toBe('https://wa.me/972524418821');
    expect(whatsappUrl('+972-52-441-8821')).toBe('https://wa.me/972524418821');
  });

  it('classifies due dates', () => {
    expect(dueState(iso(-2))).toBe('overdue');
    expect(dueState(iso(0))).toBe('today');
    expect(dueState(iso(5))).toBe('week');
    expect(dueState(iso(30))).toBe('later');
  });

  it('separates coverage gaps from operational alerts', () => {
    expect(isGap('coverage_gap_disability')).toBe(true);
    expect(isGap('payment_overdue')).toBe(false);
  });

  it('wraps identifiers in bidi isolates so they render correctly inside RTL sentences', () => {
    const p = isolateParams({ claimNumber: 'CL-1', policyNumber: 'P-9', days: 3 });
    expect(p['claimNumber']).toBe('⁦#CL-1⁩');
    expect(p['policyNumber']).toBe('⁦P-9⁩');
    expect(p['days']).toBe(3);
  });

  it('merges interactions, documents and claim events newest first', () => {
    const v = {
      interactions: [{ id: 'i', channel: 'whatsapp', direction: 'in', summary: 's', at: iso(-1) }],
      documents: [{ id: 'd', name: 'n', kind: 'claim', uploadedAt: iso(-3) }],
      claims: [{ id: 'c', claimNumber: '1', openedAt: iso(-10), closedAt: iso(-5) }],
    } as unknown as Customer360;
    expect(buildTimeline(v).map((e) => `${e.key}:${e.tone}`)).toEqual([
      'interaction.whatsapp:message',
      'document:doc',
      'claimClosed:done',
      'claimOpened:claim',
    ]);
  });
});
