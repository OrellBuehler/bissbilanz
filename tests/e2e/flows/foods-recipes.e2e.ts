import { test, expect } from '@playwright/test';
import { resetAndSeed } from '../utils/db';
import { prepare, gotoReady } from '../utils/app';

test.beforeEach(async ({ page }) => {
	await resetAndSeed();
	await prepare(page);
});

test('create a food and find it in the list', async ({ page }) => {
	await gotoReady(page, '/foods');
	await page.getByRole('button', { name: 'New Food' }).click();
	await page.locator('#name').fill('Almond Butter');
	await page.locator('#servingSize').fill('100');
	await page.locator('#calories').fill('600');
	await page.locator('#protein').fill('21');
	await page.locator('#carbs').fill('19');
	await page.locator('#fat').fill('53');
	await page.locator('#fiber').fill('10');
	await page.getByRole('button', { name: 'Save' }).dispatchEvent('click');
	await expect(page.getByText('Almond Butter')).toBeVisible();
	await page.getByPlaceholder('Search foods').fill('almond');
	await expect(page.getByText('Almond Butter')).toBeVisible();
	await expect(page.getByText('Apple')).toHaveCount(0);
});

test('create a recipe from existing foods', async ({ page }) => {
	await gotoReady(page, '/recipes');
	await page.getByRole('button', { name: 'New Recipe' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByPlaceholder('Recipe name').fill('Apple Porridge');
	await dialog.getByRole('combobox').first().dispatchEvent('click');
	await page.getByRole('option', { name: /Apple/ }).click();
	await dialog.getByPlaceholder('Qty').fill('200');
	await dialog.getByRole('button', { name: 'Save recipe' }).dispatchEvent('click');
	await expect(page.getByText('Apple Porridge')).toBeVisible();
	await expect(page.getByText('104 kcal')).toBeVisible();
});
