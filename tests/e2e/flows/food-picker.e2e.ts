import { test, expect } from '@playwright/test';
import { resetAndSeed, FIXED_DATE } from '../utils/db';
import { prepare, gotoReady } from '../utils/app';

const DAY = `/home?date=${FIXED_DATE}`;

test.beforeEach(async ({ page }) => {
	await resetAndSeed();
	await prepare(page, { fixedClock: true });
	await gotoReady(page, DAY);
	await page.getByRole('button', { name: 'Add Food' }).nth(2).click();
	await expect(page.getByPlaceholder('Search foods...')).toBeVisible();
});

test('picker lists the food database', async ({ page }) => {
	await expect(page.getByText('Basmati Rice')).toBeVisible();
	await expect(page).toHaveScreenshot('food-picker.png');
});

test('searching narrows the picker', async ({ page }) => {
	await page.getByPlaceholder('Search foods...').fill('Apple');
	await expect(page.getByText('Apple').first()).toBeVisible();
	await expect(page.getByText('Basmati Rice')).toHaveCount(0);
	await expect(page).toHaveScreenshot('food-picker-search.png');
});

test('a search without a match shows the empty state', async ({ page }) => {
	await page.getByPlaceholder('Search foods...').fill('zzzzzz');
	await expect(page.getByText('Basmati Rice')).toHaveCount(0);
	await expect(page).toHaveScreenshot('food-picker-no-results.png');
});

test('choosing a food moves on to the amount step', async ({ page }) => {
	await page.getByPlaceholder('Search foods...').fill('Apple');
	await page.getByRole('button', { name: 'Add', exact: true }).first().click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
	await expect(page).toHaveScreenshot('food-picker-amount.png');
});
