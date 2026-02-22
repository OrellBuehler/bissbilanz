import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = join(__dirname, '.auth/session.json');

export default async function globalSetup() {
	const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:4000';
	const browser = await chromium.launch();
	const context = await browser.newContext();
	const page = await context.newPage();

	let res;
	try {
		res = await page.request.post(`${baseURL}/api/auth/test-session`);
	} catch {
		throw new Error(
			`Could not reach dev server at ${baseURL}.\n` +
				'Start it with: PLAYWRIGHT_TEST_AUTH_BYPASS=true bun run dev'
		);
	}

	if (!res.ok()) {
		const body = await res.text();
		throw new Error(
			`Test session creation failed (${res.status()}): ${body}\n` +
				'Make sure dev server is running with PLAYWRIGHT_TEST_AUTH_BYPASS=true'
		);
	}

	mkdirSync(dirname(SESSION_FILE), { recursive: true });
	await context.storageState({ path: SESSION_FILE });
	await browser.close();
}
