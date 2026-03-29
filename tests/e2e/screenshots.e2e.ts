import { test, expect } from '@playwright/test';

const pages = [
	{ name: 'Dashboard', path: '/' },
	{ name: 'Foods', path: '/foods' },
	{ name: 'History', path: '/history' },
	{ name: 'Goals', path: '/goals' },
	{ name: 'Insights', path: '/insights' },
	{ name: 'Weight', path: '/weight' },
	{ name: 'Supplements', path: '/supplements' },
	{ name: 'Recipes', path: '/recipes' }
];

for (const { name, path } of pages) {
	test(`${name} page screenshot`, async ({ page }) => {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		await expect(page).toHaveScreenshot(`${name.toLowerCase().replace(/ /g, '-')}.png`, {
			maxDiffPixels: 200,
			fullPage: true
		});
	});
}
