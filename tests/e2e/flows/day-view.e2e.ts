import { test, expect } from '@playwright/test';
import { resetAndSeed, FIXED_DATE } from '../utils/db';
import { prepare, gotoReady } from '../utils/app';

const DAY = `/home?date=${FIXED_DATE}`;

test('day view groups the seeded entries by meal', async ({ page }) => {
	await resetAndSeed();
	await prepare(page, { fixedClock: true });
	await gotoReady(page, DAY);
	await expect(page.getByText('Rolled Oats × 50 g')).toBeVisible();
	await expect(page.getByText('Chicken Breast × 150 g')).toBeVisible();
	await page.getByText('Rolled Oats × 50 g').scrollIntoViewIfNeeded();
	await expect(page).toHaveScreenshot('day-view.png');
});

test('day view without entries shows every meal empty', async ({ page }) => {
	await resetAndSeed({ seedEntries: false });
	await prepare(page, { fixedClock: true });
	await gotoReady(page, DAY);
	await expect(page.getByText('Rolled Oats × 50 g')).toHaveCount(0);
	await page.getByRole('button', { name: 'Add Food' }).first().scrollIntoViewIfNeeded();
	await expect(page).toHaveScreenshot('day-view-empty.png');
});

test('entry sheet opens over the day view', async ({ page }) => {
	await resetAndSeed();
	await prepare(page, { fixedClock: true });
	await gotoReady(page, DAY);
	await page.getByText('Chicken Breast × 150 g').click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(page).toHaveScreenshot('day-view-entry-sheet.png');
});
