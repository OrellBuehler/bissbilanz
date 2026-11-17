import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT_LAYOUT_FILE = join(process.cwd(), 'src/routes/+layout.svelte');

describe('PWA manifest link injection', () => {
	test('root layout links the web manifest in the app head', () => {
		const source = readFileSync(ROOT_LAYOUT_FILE, 'utf8');

		expect(source).toMatch(
			/<svelte:head>[\s\S]*<link rel="manifest" href="\/manifest\.webmanifest" \/>[\s\S]*<\/svelte:head>/
		);
	});
});
