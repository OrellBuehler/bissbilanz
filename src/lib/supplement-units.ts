export const scheduleTypeValues = ['daily', 'every_other_day', 'weekly', 'specific_days'] as const;
export type ScheduleType = (typeof scheduleTypeValues)[number];

export const dosageUnitValues = ['mg', 'mcg', 'IU', 'g', 'capsules', 'tablets', 'drops', 'ml'] as const;
export type DosageUnit = (typeof dosageUnitValues)[number];
