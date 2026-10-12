import { describe, expect, test } from 'vitest';
import { getNavGroups, getNavItems } from '$lib/config/navigation';

describe('admin navigation item', () => {
	test('is hidden by default and for non-admins', () => {
		expect(getNavItems().some((item) => item.href === '/admin')).toBe(false);
		expect(getNavItems({ isAdmin: false }).some((item) => item.href === '/admin')).toBe(false);
	});

	test('is appended to the last group for admins', () => {
		const groups = getNavGroups({ isAdmin: true });
		const last = groups[groups.length - 1].items;
		expect(last.at(-1)?.href).toBe('/admin');
		expect(last.at(-1)?.title()).toBe('Admin');
		expect(getNavItems({ isAdmin: true }).filter((item) => item.href === '/admin')).toHaveLength(1);
	});

	test('does not mutate the groups returned for non-admins', () => {
		getNavGroups({ isAdmin: true });
		expect(getNavItems().some((item) => item.href === '/admin')).toBe(false);
	});
});
