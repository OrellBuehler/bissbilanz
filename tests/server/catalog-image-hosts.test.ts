import { describe, test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { ALLOWED_IMAGE_HOSTS, allowedImageUrl } from '$lib/server/catalog/image-hosts';

describe('allowedImageUrl', () => {
	test('keeps Open Food Facts images', () => {
		const url = 'https://images.openfoodfacts.org/images/products/123/front_de.4.400.jpg';
		expect(allowedImageUrl(url)).toBe(url);
		expect(allowedImageUrl('https://images.openfoodfacts.net/images/products/1.jpg')).toBe(
			'https://images.openfoodfacts.net/images/products/1.jpg'
		);
	});

	test('drops hosts the CSP img-src does not allow', () => {
		// What the Migros crawler adapter writes into a dataset.
		expect(allowedImageUrl('https://image.migros.ch/100001.jpg')).toBeNull();
		expect(allowedImageUrl('https://evil.example/images.openfoodfacts.org/x.jpg')).toBeNull();
		expect(allowedImageUrl('https://images.openfoodfacts.org.evil.example/x.jpg')).toBeNull();
	});

	test('drops non-https and unparseable URLs', () => {
		expect(allowedImageUrl('http://images.openfoodfacts.org/x.jpg')).toBeNull();
		expect(allowedImageUrl('javascript:alert(1)')).toBeNull();
		expect(allowedImageUrl('not a url')).toBeNull();
		expect(allowedImageUrl(null)).toBeNull();
		expect(allowedImageUrl(undefined)).toBeNull();
	});

	test('keeps our own uploads, which img-src self covers', () => {
		expect(allowedImageUrl('/uploads/aaaaaaaa-0000-4000-8000-000000000001.webp')).toBe(
			'/uploads/aaaaaaaa-0000-4000-8000-000000000001.webp'
		);
	});

	test('every allowed host is in the CSP img-src directive', async () => {
		const config = await readFile(new URL('../../svelte.config.js', import.meta.url), 'utf-8');
		const imgSrc = config.match(/'img-src':\s*\[([^\]]*)\]/)?.[1] ?? '';
		for (const host of ALLOWED_IMAGE_HOSTS) {
			expect(imgSrc).toContain(`https://${host}`);
		}
	});
});
