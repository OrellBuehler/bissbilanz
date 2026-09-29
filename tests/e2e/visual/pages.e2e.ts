import { test, expect } from '@playwright/test';
import { resetAndSeed, FIXED_DATE } from '../utils/db';
import { prepare, gotoReady } from '../utils/app';

const pages = [
	{ name: 'dashboard', path: `/home?date=${FIXED_DATE}` },
	{ name: 'foods', path: '/foods' },
	{ name: 'recipes', path: '/recipes' },
	{ name: 'day-log', path: `/history/${FIXED_DATE}` },
	{ name: 'goals', path: '/goals' },
	{ name: 'settings', path: '/settings' }
];

test.beforeAll(async () => {
	await resetAndSeed();
});

for (const { name, path } of pages) {
	test(`${name} matches the baseline`, async ({ page }) => {
		await prepare(page, { fixedClock: true });
		await gotoReady(page, path);
		await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
	});
}
