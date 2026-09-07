import { describe, expect, test } from 'vitest';
import {
	parseCsvRows,
	parseWeightCsv,
	parseSleepCsv,
	parseDate,
	parseNumber,
	parseTimeCell,
	parseDuration,
	durationBetween,
	DEFAULT_SLEEP_QUALITY
} from '../../src/lib/import/csv';

describe('parseCsvRows', () => {
	test('reads quoted fields, doubled quotes and CRLF', () => {
		const rows = parseCsvRows('a,b\r\n"x,1","he said ""hi"""\r\n');
		expect(rows).toEqual([
			['a', 'b'],
			['x,1', 'he said "hi"']
		]);
	});

	test('strips the UTF-8 BOM the export writes', () => {
		expect(parseCsvRows('﻿date,weight_kg\n2026-01-01,80')[0]).toEqual(['date', 'weight_kg']);
	});

	test('detects a semicolon delimiter', () => {
		expect(parseCsvRows('date;weight_kg\n2026-01-01;80')).toEqual([
			['date', 'weight_kg'],
			['2026-01-01', '80']
		]);
	});

	test('drops blank lines', () => {
		expect(parseCsvRows('a,b\n\n1,2\n')).toHaveLength(2);
	});
});

describe('cell parsers', () => {
	test('parseDate accepts ISO and dd.mm.yyyy', () => {
		expect(parseDate('2026-03-04')).toBe('2026-03-04');
		expect(parseDate('4.3.2026')).toBe('2026-03-04');
		expect(parseDate('04/03/2026')).toBe('2026-03-04');
		expect(parseDate('nope')).toBeNull();
	});

	test('parseNumber handles a decimal comma but not thousands separators', () => {
		expect(parseNumber('75,5')).toBe(75.5);
		expect(parseNumber('75.5')).toBe(75.5);
		expect(parseNumber('1,234.5')).toBe(1234.5);
		expect(parseNumber('')).toBeNull();
		expect(parseNumber('abc')).toBeNull();
	});

	test('parseTimeCell normalizes wall clock and keeps instants', () => {
		expect(parseTimeCell('7:05')).toBe('07:05');
		expect(parseTimeCell('23:45:00')).toBe('23:45');
		expect(parseTimeCell('2026-01-02T22:30:00.000Z')).toBe('2026-01-02T22:30:00.000Z');
		expect(parseTimeCell('25:00')).toBeNull();
		expect(parseTimeCell('')).toBeNull();
	});

	test('parseDuration reads clock, hours and minutes', () => {
		expect(parseDuration('7:30', false)).toBe(450);
		expect(parseDuration('7.5', false)).toBe(450);
		expect(parseDuration('450', true)).toBe(450);
	});

	test('durationBetween rolls a wall-clock wake time past midnight', () => {
		expect(durationBetween('23:00', '06:30')).toBe(450);
		expect(durationBetween('01:00', '09:00')).toBe(480);
		expect(durationBetween('2026-01-01T23:00:00.000Z', '2026-01-02T06:30:00.000Z')).toBe(450);
		expect(durationBetween('23:00', '2026-01-02T06:30:00.000Z')).toBeNull();
	});
});

describe('parseWeightCsv', () => {
	test('parses the documented columns', () => {
		const { rows, issues } = parseWeightCsv(
			'date,weight_kg,notes\n2026-01-01,80.5,morning\n2026-01-02,80.1,\n'
		);
		expect(issues).toEqual([]);
		expect(rows).toEqual([
			{ entryDate: '2026-01-01', weightKg: 80.5, notes: 'morning' },
			{ entryDate: '2026-01-02', weightKg: 80.1, notes: null }
		]);
	});

	test('accepts kg/gewicht aliases and a semicolon file', () => {
		const { rows } = parseWeightCsv('Datum;Gewicht\n01.01.2026;80,5');
		expect(rows).toEqual([{ entryDate: '2026-01-01', weightKg: 80.5, notes: null }]);
	});

	test('reports missing columns without rows', () => {
		const { rows, issues } = parseWeightCsv('foo,bar\n1,2');
		expect(rows).toHaveLength(0);
		expect(issues[0].message).toMatch(/Missing required columns/);
	});

	test('reports the row number of an invalid value and keeps the rest', () => {
		const { rows, issues } = parseWeightCsv(
			'date,weight_kg\n2026-01-01,80\nnotadate,79\n2026-01-03,999\n2026-01-04,79\n'
		);
		expect(rows).toHaveLength(2);
		expect(issues.map((issue) => issue.row)).toEqual([3, 4]);
	});

	test('flags a duplicate date inside the file', () => {
		const { rows, issues } = parseWeightCsv('date,kg\n2026-01-01,80\n2026-01-01,81');
		expect(rows).toHaveLength(1);
		expect(issues[0].message).toMatch(/Duplicate date/);
	});
});

describe('parseSleepCsv', () => {
	test('computes the duration from bedtime and wake time', () => {
		const { rows, issues } = parseSleepCsv(
			'date,bedtime,wake_time,quality,notes\n2026-01-01,23:00,06:30,8,ok\n'
		);
		expect(issues).toEqual([]);
		expect(rows[0]).toEqual({
			entryDate: '2026-01-01',
			durationMinutes: 450,
			quality: 8,
			bedtime: '23:00',
			wakeTime: '06:30',
			notes: 'ok'
		});
	});

	test('prefers an explicit duration column and defaults the quality', () => {
		const { rows } = parseSleepCsv('date,duration\n2026-01-01,7:15\n');
		expect(rows[0].durationMinutes).toBe(435);
		expect(rows[0].quality).toBe(DEFAULT_SLEEP_QUALITY);
	});

	test('reads duration_minutes as minutes', () => {
		const { rows } = parseSleepCsv('date,duration_minutes\n2026-01-01,430\n');
		expect(rows[0].durationMinutes).toBe(430);
	});

	test('keeps ISO instants from the app export verbatim', () => {
		const { rows } = parseSleepCsv(
			'date,duration_minutes,quality,bedtime,wake_time\n2026-01-01,450,7,2026-01-01T22:00:00.000Z,2026-01-02T05:30:00.000Z\n'
		);
		expect(rows[0].bedtime).toBe('2026-01-01T22:00:00.000Z');
		expect(rows[0].wakeTime).toBe('2026-01-02T05:30:00.000Z');
	});

	test('rejects an out-of-range quality and an unusable duration', () => {
		const { rows, issues } = parseSleepCsv(
			'date,duration,quality\n2026-01-01,7,11\n2026-01-02,,7\n2026-01-03,8,6\n'
		);
		expect(rows).toHaveLength(1);
		expect(issues).toHaveLength(2);
		expect(issues[0].message).toMatch(/quality/);
		expect(issues[1].message).toMatch(/duration/);
	});

	test('requires a duration source', () => {
		const { rows, issues } = parseSleepCsv('date,quality\n2026-01-01,7');
		expect(rows).toHaveLength(0);
		expect(issues[0].message).toMatch(/Missing required columns/);
	});
});
