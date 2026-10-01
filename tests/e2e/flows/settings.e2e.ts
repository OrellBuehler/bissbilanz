import { test, expect } from '@playwright/test';
import { resetAndSeed } from '../utils/db';
import { prepare, gotoReady } from '../utils/app';

test.beforeEach(async ({ page }) => {
	await resetAndSeed();
	await prepare(page, { fixedClock: true });
	await gotoReady(page, '/settings');
});

test('settings page renders its sections on a phone', async ({ page }) => {
	await expect(page.getByRole('heading', { name: 'Settings', exact: true }).first()).toBeVisible();
	await expect(page).toHaveScreenshot('settings.png');
});

test('settings page scrolls to the bottom without horizontal overflow', async ({ page }) => {
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
	await expect(page).toHaveScreenshot('settings-bottom.png');
});
