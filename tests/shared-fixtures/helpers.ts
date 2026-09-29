import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Platform = 'web' | 'kotlin' | 'swift';

export type Divergence = { platform: Platform; expected: unknown; reason: string };

export type FixtureCase = {
	fn: string;
	name: string;
	input: Record<string, any>;
	expected: any;
	divergences?: Divergence[];
};

export type FixtureFile = {
	tolerance?: number;
	implementations: Record<string, Platform[]>;
	cases: FixtureCase[];
};

export const loadFixture = (file: string): FixtureFile =>
	JSON.parse(readFileSync(resolve(__dirname, '../fixtures/shared', file), 'utf-8'));

/**
 * The cases this platform implements. Every case's fn must be listed in
 * `implementations`, so a new fixture function cannot be silently skipped.
 */
export function casesFor(fixture: FixtureFile, platform: Platform): FixtureCase[] {
	const unlisted = fixture.cases.filter((c) => !fixture.implementations[c.fn]);
	if (unlisted.length > 0) {
		throw new Error(`fn missing from implementations: ${unlisted.map((c) => c.fn).join(', ')}`);
	}
	return fixture.cases.filter((c) => fixture.implementations[c.fn].includes(platform));
}

/** The expectation for a platform, honouring a documented known divergence. */
export function expectedFor(c: FixtureCase, platform: Platform): unknown {
	const divergence = c.divergences?.find((d) => d.platform === platform);
	return divergence ? divergence.expected : c.expected;
}

/**
 * Compares `actual` to `expected`: numbers within `tolerance`, objects on the keys
 * `expected` names (an absent actual key equals an expected null), arrays element
 * by element. Returns a list of mismatches, empty when equal.
 */
export function diff(actual: any, expected: any, tolerance: number, path = ''): string[] {
	if (expected === null || expected === undefined) {
		return actual === null || actual === undefined
			? []
			: [`${path}: expected null, got ${JSON.stringify(actual)}`];
	}
	if (typeof expected === 'number') {
		return typeof actual === 'number' && Math.abs(actual - expected) <= tolerance
			? []
			: [`${path}: expected ${expected}, got ${JSON.stringify(actual)}`];
	}
	if (Array.isArray(expected)) {
		if (!Array.isArray(actual) || actual.length !== expected.length) {
			return [`${path}: expected array of ${expected.length}, got ${JSON.stringify(actual)}`];
		}
		return expected.flatMap((e, i) => diff(actual[i], e, tolerance, `${path}[${i}]`));
	}
	if (typeof expected === 'object') {
		if (actual === null || typeof actual !== 'object') {
			return [`${path}: expected object, got ${JSON.stringify(actual)}`];
		}
		return Object.keys(expected).flatMap((k) =>
			diff(actual[k], expected[k], tolerance, `${path}.${k}`)
		);
	}
	return actual === expected
		? []
		: [`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`];
}
