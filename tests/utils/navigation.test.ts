import { describe, expect, test } from 'vitest';
import { breadcrumbLabelKeys } from '../../src/lib/config/navigation';

describe('breadcrumb label keys', () => {
	test('every nav route segment has a breadcrumb label key', () => {
		const navHrefs = [
			'/favorites',
			'/foods',
			'/recipes',
			'/supplements',
			'/weight',
			'/insights',
			'/goals',
			'/history',
			'/maintenance',
			'/settings',
			'/settings/mcp'
		];

		const keys: Set<string> = new Set(breadcrumbLabelKeys);

		for (const href of navHrefs) {
			const segments = href.split('/').filter(Boolean);
			for (const segment of segments) {
				expect(keys.has(segment)).toBe(true);
			}
		}
	});

	test('includes the root app key', () => {
		expect(breadcrumbLabelKeys).toContain('app');
	});
});
