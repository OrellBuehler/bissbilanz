import { describe, it, expect } from 'vitest';
import {
	FASTING_PROTOCOLS,
	clampStart,
	clampTargetHours,
	fastLocalDates,
	fastOverlapsDate,
	fastProgress,
	fastReachedTarget,
	fastsOnDate,
	formatClock,
	formatDuration,
	durationMinutes,
	protocolForHours,
	summarizeFasts
} from '$lib/utils/fasting';

const fast = (startedAt: string, endedAt: string, targetHours = 16, id = startedAt) => ({
	id,
	startedAt,
	endedAt,
	targetHours
});

describe('protocols', () => {
	it('exposes the four presets plus custom', () => {
		expect(FASTING_PROTOCOLS.map((p) => p.id)).toEqual(['16:8', '18:6', '20:4', '24h', 'custom']);
	});

	it('maps hours back to their preset', () => {
		expect(protocolForHours(16)).toBe('16:8');
		expect(protocolForHours(24)).toBe('24h');
		expect(protocolForHours(13)).toBe('custom');
	});

	it('never lets a start time run into the future', () => {
		expect(clampStart(500, 1000)).toBe(500);
		expect(clampStart(2000, 1000)).toBe(1000);
	});

	it('clamps target hours into the schema bounds', () => {
		expect(clampTargetHours(0)).toBe(1);
		expect(clampTargetHours(-5)).toBe(1);
		expect(clampTargetHours(999)).toBe(168);
		expect(clampTargetHours(16.4)).toBe(16);
	});
});

describe('fastProgress', () => {
	const start = Date.parse('2026-01-01T20:00:00Z');

	it('reports elapsed, remaining and fractional progress', () => {
		const p = fastProgress(start, start + 8 * 3_600_000, 16);
		expect(p.elapsedMs).toBe(8 * 3_600_000);
		expect(p.remainingMs).toBe(8 * 3_600_000);
		expect(p.progress).toBeCloseTo(0.5);
		expect(p.reached).toBe(false);
	});

	it('caps progress at 1 and clamps remaining to 0 past the target', () => {
		const p = fastProgress(start, start + 20 * 3_600_000, 16);
		expect(p.progress).toBe(1);
		expect(p.remainingMs).toBe(0);
		expect(p.reached).toBe(true);
		expect(p.elapsedMs).toBe(20 * 3_600_000);
	});

	it('treats exactly hitting the target as reached', () => {
		expect(fastProgress(start, start + 16 * 3_600_000, 16).reached).toBe(true);
	});

	it('never reports a negative elapsed time for a future start', () => {
		expect(fastProgress(start, start - 3_600_000, 16).elapsedMs).toBe(0);
	});

	it('does not divide by zero on a malformed zero-hour target', () => {
		const p = fastProgress(start, start + 3_600_000, 0);
		expect(p.progress).toBe(1);
		expect(p.remainingMs).toBe(0);
	});
});

describe('formatting', () => {
	it('formats durations the way the history rows do', () => {
		expect(formatDuration(16 * 3_600_000 + 20 * 60_000)).toBe('16h 20m');
		expect(formatDuration(45 * 60_000)).toBe('0h 45m');
		expect(formatDuration(2 * 3_600_000)).toBe('2h 00m');
		expect(formatDuration(0)).toBe('0h 00m');
		expect(formatDuration(-5000)).toBe('0h 00m');
	});

	it('formats the live clock readout with unpadded hours', () => {
		expect(formatClock(0)).toBe('0:00:00');
		expect(formatClock(16 * 3_600_000 + 20 * 60_000 + 5000)).toBe('16:20:05');
		expect(formatClock(-1)).toBe('0:00:00');
	});

	it('computes whole minutes between two instants', () => {
		expect(durationMinutes('2026-01-01T20:00:00Z', '2026-01-02T12:20:00Z')).toBe(980);
		expect(durationMinutes('2026-01-02T12:20:00Z', '2026-01-01T20:00:00Z')).toBe(0);
	});
});

describe('fastReachedTarget', () => {
	it('is true only when the session met its target', () => {
		expect(fastReachedTarget(fast('2026-01-01T20:00:00Z', '2026-01-02T12:00:00Z', 16))).toBe(true);
		expect(fastReachedTarget(fast('2026-01-01T20:00:00Z', '2026-01-02T11:00:00Z', 16))).toBe(false);
	});
});

describe('fastLocalDates', () => {
	it('covers the start and end day of an overnight fast', () => {
		expect(fastLocalDates(fast('2026-01-01T20:00:00Z', '2026-01-02T12:00:00Z'), 'UTC')).toEqual([
			'2026-01-01',
			'2026-01-02'
		]);
	});

	it('returns a single date for a same-day fast', () => {
		expect(fastLocalDates(fast('2026-01-01T06:00:00Z', '2026-01-01T18:00:00Z'), 'UTC')).toEqual([
			'2026-01-01'
		]);
	});

	it('buckets by the given timezone, not UTC', () => {
		// 23:00 UTC on Jan 1 is already Jan 2 in Zurich (UTC+1).
		expect(
			fastLocalDates(fast('2026-01-01T23:00:00Z', '2026-01-02T10:00:00Z'), 'Europe/Zurich')
		).toEqual(['2026-01-02']);
	});

	it('spans every day of a multi-day fast', () => {
		expect(fastLocalDates(fast('2026-01-01T08:00:00Z', '2026-01-04T08:00:00Z', 72), 'UTC')).toEqual(
			['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']
		);
	});

	it('returns nothing for an unparsable or inverted range', () => {
		expect(fastLocalDates(fast('nope', '2026-01-02T12:00:00Z'), 'UTC')).toEqual([]);
		expect(fastLocalDates(fast('2026-01-02T12:00:00Z', '2026-01-01T20:00:00Z'), 'UTC')).toEqual([]);
	});
});

describe('fastOverlapsDate / fastsOnDate', () => {
	const overnight = fast('2026-01-01T20:00:00Z', '2026-01-02T12:20:00Z', 16, 'a');
	const later = fast('2026-01-03T20:00:00Z', '2026-01-04T14:00:00Z', 18, 'b');

	it('matches both days of an overnight fast', () => {
		expect(fastOverlapsDate(overnight, '2026-01-01', 'UTC')).toBe(true);
		expect(fastOverlapsDate(overnight, '2026-01-02', 'UTC')).toBe(true);
		expect(fastOverlapsDate(overnight, '2026-01-03', 'UTC')).toBe(false);
	});

	it('filters a list down to the fasts touching a date', () => {
		expect(fastsOnDate([overnight, later], '2026-01-02', 'UTC').map((f) => f.id)).toEqual(['a']);
		expect(fastsOnDate([overnight, later], '2026-01-05', 'UTC')).toEqual([]);
	});
});

describe('summarizeFasts', () => {
	const now = Date.parse('2026-01-10T12:00:00Z');

	it('returns zeroes for an empty list', () => {
		expect(summarizeFasts([], now)).toEqual({
			thisWeek: 0,
			averageMinutes: 0,
			longestMinutes: 0,
			total: 0
		});
	});

	it('counts the last seven days, averages and finds the longest', () => {
		const summary = summarizeFasts(
			[
				fast('2026-01-09T20:00:00Z', '2026-01-10T12:00:00Z', 16, 'a'), // 16 h, this week
				fast('2026-01-07T20:00:00Z', '2026-01-08T14:00:00Z', 18, 'b'), // 18 h, this week
				fast('2025-12-20T20:00:00Z', '2025-12-21T20:00:00Z', 24, 'c') // 24 h, older
			],
			now
		);
		expect(summary.total).toBe(3);
		expect(summary.thisWeek).toBe(2);
		expect(summary.longestMinutes).toBe(24 * 60);
		expect(summary.averageMinutes).toBe(Math.round((16 * 60 + 18 * 60 + 24 * 60) / 3));
	});

	it('excludes a fast that ended exactly eight days ago', () => {
		const summary = summarizeFasts(
			[fast('2026-01-01T20:00:00Z', '2026-01-02T12:00:00Z', 16, 'a')],
			now
		);
		expect(summary.thisWeek).toBe(0);
		expect(summary.total).toBe(1);
	});
});
