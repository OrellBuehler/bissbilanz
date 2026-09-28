import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { apiPaths } from '../../src/lib/server/openapi';

// Every documented operation with a 2xx JSON response should have at least one
// tests/**/*.test.ts call asserting its real response against that schema via
// expectResponseContract (tests/helpers/contract.ts). This is a static scan
// (not a runtime check that the calls actually pass), so it catches a new or
// changed 2xx JSON operation that nobody wired up — shrink this list, don't
// grow it.
const EXEMPT: Record<string, string> = {};

function findTestFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return findTestFiles(path);
		return entry.name.endsWith('.test.ts') ? [path] : [];
	});
}

const CALL_RE = /expectResponseContract\(\s*['"]([A-Z]+)['"]\s*,\s*['"]([^'"]+)['"]/g;

function coveredOperations(): Set<string> {
	const covered = new Set<string>();
	for (const file of findTestFiles('tests')) {
		const content = readFileSync(file, 'utf8');
		for (const match of content.matchAll(CALL_RE)) {
			covered.add(`${match[1]} ${match[2]}`);
		}
	}
	return covered;
}

function operationsNeedingCoverage(): string[] {
	const paths = apiPaths as Record<string, Record<string, { responses?: Record<string, unknown> }>>;
	const ops: string[] = [];
	for (const [path, item] of Object.entries(paths)) {
		for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
			const operation = item[method];
			if (!operation) continue;
			const responses = (operation.responses ?? {}) as Record<
				string,
				{ content?: Record<string, unknown> } | undefined
			>;
			const has2xxJson = Object.entries(responses).some(
				([status, response]) => /^2\d\d$/.test(status) && response?.content?.['application/json']
			);
			if (has2xxJson) ops.push(`${method.toUpperCase()} ${path}`);
		}
	}
	return ops;
}

describe('Response contract coverage', () => {
	const needsCoverage = operationsNeedingCoverage();
	const covered = coveredOperations();

	test('finds documented operations', () => {
		expect(needsCoverage.length).toBeGreaterThan(50);
	});

	test('every documented 2xx JSON operation is asserted with expectResponseContract, or exempt', () => {
		const missing = needsCoverage.filter((op) => !covered.has(op) && !(op in EXEMPT));
		expect(
			missing,
			'add an expectResponseContract(...) call for these operations, or add a reasoned EXEMPT entry'
		).toEqual([]);
	});

	test('the exempt list has no stale entries', () => {
		const needsCoverageSet = new Set(needsCoverage);
		const stale = Object.keys(EXEMPT).filter((op) => !needsCoverageSet.has(op) || covered.has(op));
		expect(stale, 'remove these from EXEMPT').toEqual([]);
	});
});
