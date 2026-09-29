import { test, expect } from '@playwright/test';
import { resetAndSeed, listEntryNames, FIXED_DATE } from '../utils/db';
import { prepare, gotoReady } from '../utils/app';

test.beforeEach(async ({ page }) => {
	await resetAndSeed();
	await prepare(page);
});

test('logging offline queues the entry and syncs it after reconnecting', async ({
	page,
	context
}) => {
	await gotoReady(page, `/home?date=${FIXED_DATE}`);
	await context.setOffline(true);

	await page.getByRole('button', { name: 'Add Food' }).nth(2).click();
	await page.getByPlaceholder('Search foods...').fill('Apple');
	await page.getByRole('button', { name: 'Add', exact: true }).first().click();
	await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Apple × 100 g')).toBeVisible();
	expect(await listEntryNames(FIXED_DATE)).not.toContain('Apple');

	await context.setOffline(false);
	await expect.poll(() => listEntryNames(FIXED_DATE), { timeout: 20_000 }).toContain('Apple');

	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.getByText('Apple × 100 g')).toBeVisible();
	expect((await listEntryNames(FIXED_DATE)).filter((n) => n === 'Apple')).toHaveLength(1);
});
