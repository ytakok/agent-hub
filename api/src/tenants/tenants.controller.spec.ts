import { UpdateSettingsDto, WorkingHoursDto, toSettingsPatch } from './tenants.controller.js';

describe('toSettingsPatch', () => {
  it('turns the validated DTO into a plain object Firestore can store', () => {
    const dto = Object.assign(new UpdateSettingsDto(), {
      messageSlaHours: 6,
      dashboardWidgets: ['kpis', 'renewals'],
      workingHours: Object.assign(new WorkingHoursDto(), { start: '09:00', end: '17:00', days: [0, 1] }),
    });
    const patch = toSettingsPatch(dto);
    expect(Object.getPrototypeOf(patch)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(patch.workingHours)).toBe(Object.prototype);
    expect(patch).toEqual({ messageSlaHours: 6, dashboardWidgets: ['kpis', 'renewals'], workingHours: { start: '09:00', end: '17:00', days: [0, 1] } });
  });

  it('keeps partial updates partial', () => {
    expect(toSettingsPatch(Object.assign(new UpdateSettingsDto(), { dashboardWidgets: [] }))).toEqual({ dashboardWidgets: [] });
  });
});
