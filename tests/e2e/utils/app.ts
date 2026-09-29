import type { Page } from '@playwright/test';
import { FIXED_NOW } from './db';

const HINT_IDS = [
	'ai-assistant',
	'food-database',
	'getting-started',
	'goals-maintenance',
	'insights',
	'logging',
	'recipes',
	'scanning'
];

export async function prepare(page: Page, options: { fixedClock?: boolean } = {}) {
	const appOrigin = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:4000').origin;
	await page.route(
		(url) => url.protocol.startsWith('http') && url.origin !== appOrigin,
		(route) => route.abort()
	);
	await page.addInitScript((ids) => {
		localStorage.setItem('bissbilanz_hints_v1', JSON.stringify(ids));
	}, HINT_IDS);
	await page.addInitScript(() => {
		if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
			document.documentElement.classList.add('dark');
		}
	});
	if (options.fixedClock) {
		await page.clock.setFixedTime(FIXED_NOW);
	}
}

export async function gotoReady(page: Page, path: string) {
	await page.goto(path);
	await page.waitForLoadState('networkidle');
	await page.evaluate(() => document.fonts.ready);
}
