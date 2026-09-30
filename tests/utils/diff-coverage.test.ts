import { describe, expect, it } from 'vitest';
import {
	computeDiffCoverage,
	formatRanges,
	isTrackedFile,
	parseLcov,
	parseUnifiedDiff,
	renderSummary
} from '../../scripts/coverage/diff-coverage';

const LCOV = `TN:
SF:/repo/src/lib/a.ts
DA:1,1
DA:2,0
DA:3,4
end_of_record
SF:/repo/src/lib/b.ts
DA:10,0
end_of_record
`;

const DIFF = `diff --git a/src/lib/a.ts b/src/lib/a.ts
--- a/src/lib/a.ts
+++ b/src/lib/a.ts
@@ -1,0 +1,3 @@
+one
+two
+three
@@ -9 +11,2 @@ context
-old
+new
+newer
diff --git a/src/lib/gone.ts b/src/lib/gone.ts
--- a/src/lib/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-x
-y
`;

describe('parseLcov', () => {
	it('reads per-line hits and strips the repo root', () => {
		const files = parseLcov(LCOV, '/repo');
		expect(files.map((f) => f.path)).toEqual(['src/lib/a.ts', 'src/lib/b.ts']);
		expect(files[0].lines.get(3)).toBe(4);
		expect(files[0].lines.get(2)).toBe(0);
	});
});

describe('parseUnifiedDiff', () => {
	it('collects added line numbers per file and ignores deletions', () => {
		const changed = parseUnifiedDiff(DIFF);
		expect(changed.get('src/lib/a.ts')).toEqual([1, 2, 3, 11, 12]);
		expect(changed.has('src/lib/gone.ts')).toBe(false);
	});
});

describe('isTrackedFile', () => {
	it.each([
		['src/lib/utils/x.ts', true],
		['src/routes/api/foods/+server.ts', true],
		['src/lib/api/generated/schema.d.ts', false],
		['src/lib/paraglide/messages.ts', false],
		['src/lib/foo.test.ts', false],
		['src/lib/Comp.svelte', false],
		['src/routes/page/+page.ts', false]
	])('%s -> %s', (path, expected) => expect(isTrackedFile(path)).toBe(expected));
});

describe('computeDiffCoverage', () => {
	it('counts only instrumented changed lines', () => {
		const result = computeDiffCoverage(parseUnifiedDiff(DIFF), parseLcov(LCOV, '/repo'));
		expect(result.total).toBe(3);
		expect(result.covered).toBe(2);
		expect(result.files[0].uncovered).toEqual([2]);
		expect(result.pct).toBeCloseTo(66.67, 1);
	});

	it('treats a changed file missing from lcov as uncovered', () => {
		const changed = new Map([['src/lib/new.ts', [1, 2]]]);
		const result = computeDiffCoverage(changed, []);
		expect(result.total).toBe(2);
		expect(result.pct).toBe(0);
	});

	it('skips untracked files and reports null when nothing is relevant', () => {
		const changed = new Map([['src/lib/x.test.ts', [1]]]);
		const result = computeDiffCoverage(changed, []);
		expect(result.total).toBe(0);
		expect(result.pct).toBeNull();
		expect(renderSummary(result, 80)).toContain('No changed executable lines');
	});
});

describe('formatting', () => {
	it('collapses consecutive lines into ranges', () => {
		expect(formatRanges([5, 1, 2, 3, 9])).toBe('1-3, 5, 9');
	});

	it('lists uncovered lines in the summary and flags failure', () => {
		const result = computeDiffCoverage(parseUnifiedDiff(DIFF), parseLcov(LCOV, '/repo'));
		const text = renderSummary(result, 80);
		expect(text).toContain('FAILED');
		expect(text).toContain('`src/lib/a.ts` | 2 |');
	});
});
