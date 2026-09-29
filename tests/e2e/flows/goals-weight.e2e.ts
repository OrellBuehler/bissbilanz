import { test, expect } from '@playwright/test';
import { resetAndSeed } from '../utils/db';
import { prepare, gotoReady } from '../utils/app';

test.beforeEach(async ({ page }) => {
	await resetAndSeed();
	await prepare(page);
});

test('edit calorie goal and persist it', async ({ page }) => {
	await gotoReady(page, '/goals');
	const calories = page.getByRole('spinbutton').first();
	await expect(calories).toHaveValue('2000');
	await calories.fill('2300');
	await page.getByRole('button', { name: 'Save' }).dispatchEvent('click');
	await expect(page.getByText(/saved/i).first()).toBeVisible();
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('spinbutton').first()).toHaveValue('2300');
});

test('log a weight and see it in the history', async ({ page }) => {
	await gotoReady(page, '/weight');
	await page.getByPlaceholder('75.0').fill('79.9');
	await page.getByRole('button', { name: 'Log Weight' }).first().click();
	await expect(page.getByText('79.9 kg').first()).toBeVisible();
	await expect(page.getByText('Latest').locator('..')).toContainText('79.9 kg');
});
