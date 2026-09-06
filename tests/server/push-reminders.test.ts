import { describe, test, expect } from 'vitest';
import { dueReminders, localClock, type ReminderSupplement } from '$lib/server/push/reminders';

const supplement = (overrides: Partial<ReminderSupplement> = {}): ReminderSupplement => ({
	id: 'sup-1',
	name: 'Vitamin D',
	reminderTimes: ['08:00'],
	scheduleType: 'daily',
	scheduleDays: null,
	scheduleStartDate: null,
	lastRemindedAt: null,
	...overrides
});

const due = (
	now: Date,
	timeZone: string,
	supplements: ReminderSupplement[],
	logged: string[] = []
) => dueReminders({ now, timeZone, supplements, loggedSupplementIds: logged });

describe('localClock', () => {
	test('resolves the local date and minute for a timezone', () => {
		const clock = localClock(new Date('2026-03-10T07:00:00Z'), 'Europe/Zurich');
		expect(clock.date).toBe('2026-03-10');
		expect(clock.time).toBe('08:00');
	});

	test('rolls the local date over before UTC midnight', () => {
		const clock = localClock(new Date('2026-03-10T22:30:00Z'), 'Pacific/Auckland');
		expect(clock.date).toBe('2026-03-11');
		expect(clock.time).toBe('11:30');
	});

	test('truncates the dedupe boundary to the start of the minute', () => {
		const clock = localClock(new Date('2026-03-10T07:00:59.900Z'), 'UTC');
		expect(clock.minuteStart.toISOString()).toBe('2026-03-10T07:00:00.000Z');
	});
});

describe('dueReminders', () => {
	test('fires when the local wall clock matches a reminder time', () => {
		const result = due(new Date('2026-03-10T07:00:00Z'), 'Europe/Zurich', [supplement()]);
		expect(result.map((s) => s.id)).toEqual(['sup-1']);
	});

	test('does not fire a minute early or late', () => {
		expect(due(new Date('2026-03-10T06:59:00Z'), 'Europe/Zurich', [supplement()])).toHaveLength(0);
		expect(due(new Date('2026-03-10T07:01:00Z'), 'Europe/Zurich', [supplement()])).toHaveLength(0);
	});

	test('uses the user timezone, not UTC', () => {
		// 08:00 in Zurich (UTC+1 in March) is 07:00 UTC — a UTC reading would miss it.
		expect(due(new Date('2026-03-10T08:00:00Z'), 'Europe/Zurich', [supplement()])).toHaveLength(0);
		expect(due(new Date('2026-03-10T08:00:00Z'), 'UTC', [supplement()])).toHaveLength(1);
	});

	describe('DST', () => {
		// Europe/Zurich springs forward 2026-03-29 02:00 -> 03:00 (UTC+1 -> UTC+2).
		test('keeps the wall-clock time after the spring-forward transition', () => {
			// 08:00 local is 06:00 UTC once the offset is +2.
			expect(due(new Date('2026-03-29T06:00:00Z'), 'Europe/Zurich', [supplement()])).toHaveLength(
				1
			);
			expect(due(new Date('2026-03-29T07:00:00Z'), 'Europe/Zurich', [supplement()])).toHaveLength(
				0
			);
		});

		test('a reminder inside the skipped hour never fires', () => {
			const skipped = [supplement({ reminderTimes: ['02:30'] })];
			for (let minute = 0; minute < 120; minute++) {
				const now = new Date(Date.UTC(2026, 2, 29, 0, minute));
				expect(due(now, 'Europe/Zurich', skipped)).toHaveLength(0);
			}
		});

		test('a repeated local hour after the autumn fall-back only fires once', () => {
			// 2026-10-25: 03:00 -> 02:00, so 02:30 local happens at 00:30Z and 01:30Z.
			const first = new Date('2026-10-25T00:30:00Z');
			const second = new Date('2026-10-25T01:30:00Z');
			const sup = supplement({ reminderTimes: ['02:30'] });

			expect(due(first, 'Europe/Zurich', [sup])).toHaveLength(1);
			// After the first send the dedupe marker suppresses the repeat.
			const reminded = supplement({ reminderTimes: ['02:30'], lastRemindedAt: first });
			expect(due(second, 'Europe/Zurich', [reminded])).toHaveLength(0);
		});
	});

	test('midnight fires on the new local day', () => {
		const midnight = supplement({ reminderTimes: ['00:00'] });
		const result = due(new Date('2026-03-09T23:00:00Z'), 'Europe/Zurich', [midnight]);
		expect(result).toHaveLength(1);
		expect(localClock(new Date('2026-03-09T23:00:00Z'), 'Europe/Zurich').date).toBe('2026-03-10');
	});

	test('suppresses a supplement already logged for the local day', () => {
		expect(
			due(new Date('2026-03-10T07:00:00Z'), 'Europe/Zurich', [supplement()], ['sup-1'])
		).toEqual([]);
	});

	test('suppresses a supplement already reminded within the same minute', () => {
		const now = new Date('2026-03-10T07:00:40Z');
		const sameMinute = supplement({ lastRemindedAt: new Date('2026-03-10T07:00:05Z') });
		expect(due(now, 'Europe/Zurich', [sameMinute])).toHaveLength(0);
	});

	test('a marker from an earlier minute does not suppress', () => {
		const now = new Date('2026-03-10T07:00:00Z');
		const earlier = supplement({ lastRemindedAt: new Date('2026-03-09T07:00:00Z') });
		expect(due(now, 'Europe/Zurich', [earlier])).toHaveLength(1);
	});

	test('respects the supplement schedule for the local day', () => {
		// 2026-03-10 is a Tuesday (day 2) in Zurich.
		const tuesdayOnly = supplement({ scheduleType: 'specific_days', scheduleDays: [2] });
		const wednesdayOnly = supplement({
			id: 'sup-2',
			scheduleType: 'specific_days',
			scheduleDays: [3]
		});
		const result = due(new Date('2026-03-10T07:00:00Z'), 'Europe/Zurich', [
			tuesdayOnly,
			wednesdayOnly
		]);
		expect(result.map((s) => s.id)).toEqual(['sup-1']);
	});

	test('ignores supplements without reminder times', () => {
		expect(
			due(new Date('2026-03-10T07:00:00Z'), 'Europe/Zurich', [supplement({ reminderTimes: null })])
		).toHaveLength(0);
	});

	test('returns every supplement due in the same minute', () => {
		const result = due(new Date('2026-03-10T07:00:00Z'), 'Europe/Zurich', [
			supplement(),
			supplement({ id: 'sup-2', name: 'Magnesium', reminderTimes: ['07:00', '08:00'] })
		]);
		expect(result.map((s) => s.name)).toEqual(['Vitamin D', 'Magnesium']);
	});
});
