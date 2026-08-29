import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROUTES_DIR = join(process.cwd(), 'src/routes/(app)');
const APP_LAYOUT_FILE = join(APP_ROUTES_DIR, '+layout.svelte');

function collectPageFiles(dir: string): string[] {
	const entries = readdirSync(dir);
	const results: string[] = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stats = statSync(fullPath);
		if (stats.isDirectory()) {
			results.push(...collectPageFiles(fullPath));
			continue;
		}

		if (entry === '+page.svelte') {
			results.push(fullPath);
		}
	}

	return results;
}

describe('mobile page padding', () => {
	test('app layout uses compact mobile padding in the shared content container', () => {
		const layout = readFileSync(APP_LAYOUT_FILE, 'utf8');
		expect(layout).toMatch(/class="\s*min-h-0 flex-1 px-3 py-3\b/);
	});

	test('mobile main padding accounts for safe-area-inset-bottom', () => {
		const layout = readFileSync(APP_LAYOUT_FILE, 'utf8');
		expect(layout).toContain('safe-area-inset-bottom');
	});

	test('pages do not add duplicate mobile horizontal gutters on top-level wrappers', () => {
		const pageFiles = collectPageFiles(APP_ROUTES_DIR);
		const duplicateGutterPattern =
			/class="[^"]*mx-auto[^"]*max-w-[^"]*\bpx-4\b[^"]*\bsm:px-0\b[^"]*"/;

		const offenders = pageFiles
			.map((file) => ({ file, source: readFileSync(file, 'utf8') }))
			.filter(({ source }) => duplicateGutterPattern.test(source))
			.map(({ file }) => file.replace(`${process.cwd()}/`, ''));

		expect(offenders).toEqual([]);
	});
});

describe('app layout structure', () => {
	test('renders its children exactly once', () => {
		const layout = readFileSync(APP_LAYOUT_FILE, 'utf8');
		// Two breakpoint branches each rendering `children` mounts every page
		// component twice, so all of its effects and onMount work run twice.
		const renders = layout.match(/\{@render children\(\)\}/g) ?? [];
		expect(renders).toHaveLength(1);
	});
});
