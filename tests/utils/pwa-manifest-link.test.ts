import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT_LAYOUT_FILE = join(process.cwd(), 'src/routes/+layout.svelte');

describe('PWA manifest link injection', () => {
	test('root layout injects the generated manifest link into the app head', () => {
		const source = readFileSync(ROOT_LAYOUT_FILE, 'utf8');

		expect(source).toContain("import { pwaInfo } from 'virtual:pwa-info';");
		expect(source).toContain('pwaInfo?.webManifest.linkTag');
		expect(source).toMatch(/<svelte:head>[\s\S]*\{@html .*Manifest.*\}[\s\S]*<\/svelte:head>/);
	});
});
