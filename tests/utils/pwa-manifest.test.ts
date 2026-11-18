import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const STATIC_DIR = join(process.cwd(), 'static');
const manifest = JSON.parse(readFileSync(join(STATIC_DIR, 'manifest.webmanifest'), 'utf8'));

type Icon = { src: string; sizes: string; type: string; purpose?: string };

describe('static/manifest.webmanifest', () => {
	test('is installable as a standalone app scoped to the whole origin', () => {
		expect(manifest).toMatchObject({
			id: '/',
			scope: '/',
			start_url: '/',
			display: 'standalone'
		});
		expect(manifest.name).toBeTruthy();
		expect(manifest.short_name).toBeTruthy();
	});

	test('ships a maskable 512px icon next to the 192px and 512px icons', () => {
		const icons: Icon[] = manifest.icons;
		expect(icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512', '512x512']);
		expect(icons.filter((icon) => icon.purpose === 'maskable')).toHaveLength(1);
	});

	test('every icon, including the shortcut icons, exists in static/', () => {
		const sources: string[] = [
			...manifest.icons.map((icon: Icon) => icon.src),
			...manifest.shortcuts.flatMap((shortcut: { icons: Icon[] }) =>
				shortcut.icons.map((icon) => icon.src)
			)
		];

		expect(sources.length).toBeGreaterThan(0);
		for (const src of sources) {
			expect(existsSync(join(STATIC_DIR, src)), src).toBe(true);
		}
	});

	test('every shortcut stays inside the scope', () => {
		for (const shortcut of manifest.shortcuts) {
			expect(shortcut.url.startsWith(manifest.scope), shortcut.url).toBe(true);
		}
	});
});
