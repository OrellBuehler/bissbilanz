import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createScreenWakeLock } from '../../src/lib/utils/wake-lock';

type Listener = () => void;

let visibility: 'visible' | 'hidden';
let listeners: Listener[];
let request: ReturnType<typeof vi.fn>;
let release: ReturnType<typeof vi.fn>;

const setVisibility = (value: 'visible' | 'hidden') => {
	visibility = value;
	if (value === 'visible') listeners.forEach((fn) => fn());
};

beforeEach(() => {
	visibility = 'visible';
	listeners = [];
	release = vi.fn(async () => {});
	request = vi.fn(async () => ({ release }));
	vi.stubGlobal('document', {
		get visibilityState() {
			return visibility;
		},
		addEventListener: (_: string, fn: Listener) => listeners.push(fn),
		removeEventListener: (_: string, fn: Listener) => {
			listeners = listeners.filter((l) => l !== fn);
		}
	});
	vi.stubGlobal('navigator', { wakeLock: { request } });
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createScreenWakeLock', () => {
	test('requests a screen lock and releases it', async () => {
		const lock = createScreenWakeLock();
		await lock.acquire();
		expect(request).toHaveBeenCalledWith('screen');
		await lock.release();
		expect(release).toHaveBeenCalledOnce();
		expect(listeners).toHaveLength(0);
	});

	test('re-acquires when the page becomes visible again', async () => {
		let onRelease: Listener | undefined;
		request.mockImplementation(async () => ({
			release,
			addEventListener: (_: string, fn: Listener) => (onRelease = fn)
		}));
		const lock = createScreenWakeLock();
		await lock.acquire();
		expect(request).toHaveBeenCalledTimes(1);

		// The browser drops the lock while the tab is hidden.
		setVisibility('hidden');
		onRelease?.();
		setVisibility('visible');
		await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
		await lock.release();
	});

	test('does not request twice while a lock is held', async () => {
		const lock = createScreenWakeLock();
		await lock.acquire();
		setVisibility('visible');
		await Promise.resolve();
		expect(request).toHaveBeenCalledTimes(1);
		await lock.release();
	});

	test('is a silent no-op without the Wake Lock API', async () => {
		vi.stubGlobal('navigator', {});
		const lock = createScreenWakeLock();
		await expect(lock.acquire()).resolves.toBeUndefined();
		await expect(lock.release()).resolves.toBeUndefined();
	});

	test('swallows a refused request', async () => {
		request.mockRejectedValue(new Error('NotAllowedError'));
		const lock = createScreenWakeLock();
		await expect(lock.acquire()).resolves.toBeUndefined();
		await lock.release();
	});

	test('releases a lock granted after release() was called', async () => {
		let grant: (value: { release: typeof release }) => void = () => {};
		request.mockImplementation(() => new Promise((resolve) => (grant = resolve)));
		const lock = createScreenWakeLock();
		const pending = lock.acquire();
		await lock.release();
		grant({ release });
		await pending;
		expect(release).toHaveBeenCalledOnce();
	});
});
