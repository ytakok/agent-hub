import type { FeatureFlags } from '@agency-hub/shared';
import { DASHBOARD_WIDGETS, WIDGET_FEATURES, isWidgetAvailable, visibleWidgets } from './widget-registry';

const allOn = Object.fromEntries(Object.values(WIDGET_FEATURES).flat().map((k) => [k, true])) as FeatureFlags;
const starter = { ...allOn, 'integration.gmail': false, 'integration.whatsapp': false } as FeatureFlags;

describe('widget-registry', () => {
  it('shows only the selected widgets, in the selected order', () => {
    expect(visibleWidgets(['renewals', 'kpis'], allOn)).toEqual(['renewals', 'kpis']);
  });

  it('shows nothing when nothing is selected', () => {
    expect(visibleWidgets([], allOn)).toEqual([]);
  });

  it('falls back to all widgets when the tenant has no saved selection', () => {
    expect(visibleWidgets(undefined, allOn)).toEqual([...DASHBOARD_WIDGETS]);
  });

  it('hides selected widgets the plan does not include', () => {
    expect(visibleWidgets(['kpis', 'gmail', 'whatsapp', 'renewals'], starter)).toEqual(['kpis', 'renewals']);
    expect(isWidgetAvailable('gmail', starter)).toBe(false);
    expect(isWidgetAvailable('kpis', starter)).toBe(true);
  });

  it('shows nothing until the tenant config has loaded', () => {
    expect(visibleWidgets(['kpis'], null)).toEqual([]);
  });
});
