import type { DashboardWidgetKey, FeatureFlags, FeatureKey } from '@agency-hub/shared';

/**
 * Single source of truth for dashboard widgets, shared by the dashboard (what renders) and
 * Settings → Organization (what can be toggled). A widget shows when it is selected in the tenant's
 * `settings.dashboardWidgets` AND every feature it needs is enabled for the tenant's plan.
 */
export const DASHBOARD_WIDGETS: readonly DashboardWidgetKey[] = [
  'kpis',
  'crmPipeline',
  'whatsapp',
  'gmail',
  'renewals',
  'sheets',
  'activity',
  'health',
];

export const WIDGET_FEATURES: Record<DashboardWidgetKey, FeatureKey[]> = {
  kpis: [],
  crmPipeline: ['integration.crm'],
  sheets: ['integration.sheets'],
  gmail: ['integration.gmail'],
  whatsapp: ['integration.whatsapp'],
  renewals: ['integration.crm', 'dashboard.renewals'],
  activity: ['dashboard.activity'],
  health: [],
};

/** True when the tenant's plan/flags allow the widget (independent of whether it's selected). */
export function isWidgetAvailable(widget: DashboardWidgetKey, features: FeatureFlags | null): boolean {
  return !!features && WIDGET_FEATURES[widget].every((f) => features[f]);
}

/** Widgets to render, in the tenant's chosen order, minus those the plan doesn't include. */
export function visibleWidgets(selected: readonly DashboardWidgetKey[] | undefined, features: FeatureFlags | null): DashboardWidgetKey[] {
  if (!features) return [];
  return (selected ?? DASHBOARD_WIDGETS).filter((w) => isWidgetAvailable(w, features));
}
