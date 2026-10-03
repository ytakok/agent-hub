import { DEFAULT_FLAG_DEFINITIONS, mergeDefinitions, resolveFlags } from './flag-definitions.js';

describe('resolveFlags', () => {
  it('gates plan-limited features by plan', () => {
    expect(resolveFlags(DEFAULT_FLAG_DEFINITIONS, 'starter')['integration.whatsapp']).toBe(false);
    expect(resolveFlags(DEFAULT_FLAG_DEFINITIONS, 'pro')['integration.whatsapp']).toBe(true);
    expect(resolveFlags(DEFAULT_FLAG_DEFINITIONS, 'starter')['integration.crm']).toBe(true);
  });

  it('lets a tenant override win over plan defaults in both directions', () => {
    const flags = resolveFlags(DEFAULT_FLAG_DEFINITIONS, 'starter', {
      'integration.whatsapp': true,
      'integration.crm': false,
    });
    expect(flags['integration.whatsapp']).toBe(true);
    expect(flags['integration.crm']).toBe(false);
  });

  it('returns a value for every known key', () => {
    const flags = resolveFlags(DEFAULT_FLAG_DEFINITIONS, 'pro');
    expect(Object.keys(flags).sort()).toEqual(DEFAULT_FLAG_DEFINITIONS.map((d) => d.key).sort());
  });
});

describe('mergeDefinitions', () => {
  it('applies stored global changes and ignores unknown keys', () => {
    const merged = mergeDefinitions([
      { key: 'integration.sheets', defaultEnabled: false },
      { key: 'not.a.flag' as never, defaultEnabled: true },
    ]);
    expect(merged.find((d) => d.key === 'integration.sheets')?.defaultEnabled).toBe(false);
    expect(merged).toHaveLength(DEFAULT_FLAG_DEFINITIONS.length);
  });
});
