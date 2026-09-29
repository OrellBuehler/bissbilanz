import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = join(__dirname, '.auth/session.json');

export default async function globalSetup() {
	const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:4000';
	const browser = await chromium.launch({
		args: process.env.PW_HOST_MAP_IP
			? [`--host-resolver-rules=MAP localhost ${process.env.PW_HOST_MAP_IP}`]
			: []
	});
	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		await page.goto(`${baseURL}/login`);
	} catch (err) {
		throw new Error(
			`Could not reach dev server at ${baseURL}.\n` +
				'Start it with: TEST_MODE=true TEST_AUTH_TOKEN=test-integration-token bun run dev',
			{ cause: err }
		);
	}

	const res = await page.evaluate(async () => {
		const response = await fetch('/api/auth/test-session', { method: 'POST' });
		return { ok: response.ok, status: response.status, body: await response.text() };
	});

	if (!res.ok) {
		throw new Error(
			`Test session creation failed (${res.status}): ${res.body}\n` +
				'Make sure the server is running with TEST_MODE=true and TEST_AUTH_TOKEN set'
		);
	}

	mkdirSync(dirname(SESSION_FILE), { recursive: true });
	await context.storageState({ path: SESSION_FILE });
	await browser.close();
}
