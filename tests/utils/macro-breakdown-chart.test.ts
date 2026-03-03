import { describe, expect, test } from 'vitest';
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

	test('disables built-in legend so history page can render a compact header legend', () => {
		const source = readFileSync(CHART_FILE, 'utf8');

		expect(source).toMatch(/legend=\{false\}/);
	});

	test('supports filtering visible macro series for custom legend toggles', () => {
		const source = readFileSync(CHART_FILE, 'utf8');

		expect(source).toMatch(/visibleKeys\?:/);
		expect(source).toMatch(/const activeSeries = \$derived\(allSeries\.filter/);
		expect(source).toMatch(/key: s\.key/);
	});
});
