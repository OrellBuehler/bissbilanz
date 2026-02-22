import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CHART_FILE = join(process.cwd(), 'src/lib/components/charts/MacroBreakdownChart.svelte');

describe('MacroBreakdownChart', () => {
	test('disables bar strokes so zero-value stacked segments do not render black outlines', () => {
		const source = readFileSync(CHART_FILE, 'utf8');

		expect(source).toMatch(/bars:\s*\{[\s\S]*strokeWidth:\s*0/);
		expect(source).toMatch(/bars:\s*\{[\s\S]*stroke:\s*['"]none['"]/);
	});

	test('does not force rounded top corners on every stacked segment', () => {
		const source = readFileSync(CHART_FILE, 'utf8');

		expect(source).not.toMatch(/bars:\s*\{[^}]*rounded:\s*['"]top['"][^}]*\}/);
	});
});
