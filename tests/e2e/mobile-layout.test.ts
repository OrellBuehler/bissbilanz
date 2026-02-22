import { test } from '@playwright/test';
import { assertMobileLayout } from './utils/layout-checks';

const pages = [
	{ name: 'Dashboard', path: '/' },
	{ name: 'Foods', path: '/foods' },
	{ name: 'Recipes', path: '/recipes' },
	{ name: 'History', path: '/history' },
	{ name: 'Goals', path: '/goals' },
	{ name: 'Supplements', path: '/supplements' },
	{ name: 'Favorites', path: '/favorites' },
	{ name: 'Weight', path: '/weight' },
	{ name: 'Settings', path: '/settings' }
];

for (const { name, path } of pages) {
	test(`${name} page has no mobile layout issues`, async ({ page }) => {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		await assertMobileLayout(page);
	});
}
