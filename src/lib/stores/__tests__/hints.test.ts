import { afterEach, describe, expect, it, vi } from 'vitest';

function createMockStorage(overrides: Partial<Storage> = {}): Storage {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => (key in store ? store[key] : null),
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
		key: () => null,
		length: 0,
		...overrides
	} as Storage;
}

describe('hints store', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it('shows a hint that has never been dismissed', async () => {
		vi.stubGlobal('localStorage', createMockStorage());
		const { isDismissed } = await import('../hints.svelte');
		expect(isDismissed('getting-started')).toBe(false);
	});

	it('hides a hint once dismissed and persists it to storage', async () => {
		const storage = createMockStorage();
		vi.stubGlobal('localStorage', storage);
		const { isDismissed, dismiss } = await import('../hints.svelte');

		dismiss('getting-started');

		expect(isDismissed('getting-started')).toBe(true);
		expect(JSON.parse(storage.getItem('bissbilanz_hints_v1') ?? '[]')).toEqual(['getting-started']);
	});

	it('dismissing the same hint twice does not duplicate it', async () => {
		const storage = createMockStorage();
		vi.stubGlobal('localStorage', storage);
		const { dismiss } = await import('../hints.svelte');

		dismiss('scanning');
		dismiss('scanning');

		expect(JSON.parse(storage.getItem('bissbilanz_hints_v1') ?? '[]')).toEqual(['scanning']);
	});

	it('a dismissed hint from a previous session stays hidden after reload', async () => {
		const storage = createMockStorage();
		storage.setItem('bissbilanz_hints_v1', JSON.stringify(['recipes']));
		vi.stubGlobal('localStorage', storage);

		const { isDismissed } = await import('../hints.svelte');

		expect(isDismissed('recipes')).toBe(true);
		expect(isDismissed('insights')).toBe(false);
	});

	it('never crashes and always shows hints when storage is unavailable', async () => {
		vi.stubGlobal('localStorage', undefined);
		const { isDismissed, dismiss, resetAll } = await import('../hints.svelte');

		expect(isDismissed('getting-started')).toBe(false);
		expect(() => dismiss('getting-started')).not.toThrow();
		expect(() => resetAll()).not.toThrow();
	});

	it('never crashes and always shows hints when storage throws', async () => {
		vi.stubGlobal(
			'localStorage',
			createMockStorage({
				getItem: () => {
					throw new Error('storage blocked');
				},
				setItem: () => {
					throw new Error('storage blocked');
				},
				removeItem: () => {
					throw new Error('storage blocked');
				}
			})
		);
		const { isDismissed, dismiss, resetAll } = await import('../hints.svelte');

		expect(isDismissed('getting-started')).toBe(false);
		expect(() => dismiss('getting-started')).not.toThrow();
		// dismiss() still updates in-memory state even though persist() throws.
		expect(isDismissed('getting-started')).toBe(true);
		expect(() => resetAll()).not.toThrow();
	});

	it('resetAll clears every dismissed hint and the storage entry', async () => {
		const storage = createMockStorage();
		vi.stubGlobal('localStorage', storage);
		const { isDismissed, dismiss, resetAll } = await import('../hints.svelte');

		dismiss('getting-started');
		dismiss('scanning');
		resetAll();

		expect(isDismissed('getting-started')).toBe(false);
		expect(isDismissed('scanning')).toBe(false);
		expect(storage.getItem('bissbilanz_hints_v1')).toBeNull();
	});
});
