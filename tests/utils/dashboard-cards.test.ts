import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('dashboard card styling', () => {
	test('dashboard page uses DashboardCard and enables DayLog dashboard styling', () => {
		const source = read('src/routes/(app)/+page.svelte');

		expect(source).toContain(
			"import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';"
		);
		expect(source).toContain('<DashboardCard title={m.dashboard_summary()}');
		expect(source).toContain('dashboardStyle={true}');
	});

	test('dashboard widgets use the dashboard card shell', () => {
		const widgetFiles = [
			'src/lib/components/entries/MacroSummaryCard.svelte',
			'src/lib/components/favorites/FavoritesWidget.svelte',
			'src/lib/components/supplements/SupplementChecklist.svelte',
			'src/lib/components/weight/WeightWidget.svelte'
		];

		for (const file of widgetFiles) {
			const source = read(file);
			expect(source).toContain('DashboardCard');
		}
	});

	test('MealSection supports an opt-in dashboard style variant', () => {
		const source = read('src/lib/components/entries/MealSection.svelte');

		expect(source).toMatch(/dashboardStyle\?: boolean/);
		expect(source).toContain('{#if dashboardStyle}');
		expect(source).toContain('<DashboardCard ');
	});
});
