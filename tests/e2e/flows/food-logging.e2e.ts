import { test, expect } from '@playwright/test';
import { resetAndSeed, FIXED_DATE } from '../utils/db';
import { prepare, gotoReady } from '../utils/app';

const DAY = `/home?date=${FIXED_DATE}`;

test.beforeEach(async ({ page }) => {
	await resetAndSeed();
	await prepare(page);
});

test('dashboard shows seeded totals', async ({ page }) => {
	await gotoReady(page, DAY);
	await expect(page.getByText('Rolled Oats × 50 g')).toBeVisible();
	await expect(page.getByText('Greek Yogurt × 150 g')).toBeVisible();
	await expect(page.getByText('Chicken Breast × 150 g')).toBeVisible();
	await expect(page.getByText('528').first()).toBeVisible();
});

test('log a food to a meal and see totals update', async ({ page }) => {
	await gotoReady(page, DAY);
	await page.getByRole('button', { name: 'Add Food' }).nth(2).click();
	await page.getByPlaceholder('Search foods...').fill('Apple');
	await page.getByRole('button', { name: 'Add', exact: true }).first().click();
	await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Apple × 100 g')).toBeVisible();
	await expect(page.getByText('580').first()).toBeVisible();
});

test('edit an entry changes its servings and totals', async ({ page }) => {
	await gotoReady(page, DAY);
	await page.getByText('Chicken Breast × 150 g').click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.locator('input').first().fill('2');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Chicken Breast × 200 g')).toBeVisible();
	await expect(page.getByText('610').first()).toBeVisible();
});

test('delete an entry removes it and lowers totals', async ({ page }) => {
	await gotoReady(page, DAY);
	await page.getByText('Chicken Breast × 150 g').click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('Chicken Breast × 150 g')).toHaveCount(0);
	await expect(page.getByText('280').first()).toBeVisible();
});
