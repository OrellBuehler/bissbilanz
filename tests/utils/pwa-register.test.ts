import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const captureException = vi.hoisted(() => vi.fn());
const workbox = vi.hoisted(() => {
	type Listener = (event: { isUpdate?: boolean; isExternal?: boolean }) => void;
	const state = {
		instances: [] as { url: string; options: unknown; listeners: Map<string, Listener> }[],
		register: vi.fn<(options: unknown) => Promise<unknown>>()
	};
	class Workbox {
		listeners = new Map<string, Listener>();
		constructor(
			public url: string,
			public options: unknown
		) {
			state.instances.push(this);
		}
		addEventListener(type: string, listener: Listener) {
			this.listeners.set(type, listener);
		}
		register(options: unknown) {
			return state.register(options);
		}
	}
	return { state, Workbox };
});

vi.mock('@sentry/sveltekit', () => ({ captureException }));
vi.mock('workbox-window', () => ({ Workbox: workbox.Workbox }));

const { registerServiceWorker } = await import('../../src/lib/pwa/register');

describe('registerServiceWorker', () => {
	const reload = vi.fn();

	beforeEach(() => {
		workbox.state.instances.length = 0;
		workbox.state.register.mockReset().mockResolvedValue(undefined);
		captureException.mockReset();
		reload.mockReset();
		vi.stubGlobal('navigator', { serviceWorker: {} });
		vi.stubGlobal('window', { location: { reload } });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('does nothing without service worker support', () => {
		vi.stubGlobal('navigator', {});

		registerServiceWorker();

		expect(workbox.state.instances).toHaveLength(0);
	});

	test('registers the module worker immediately', () => {
		registerServiceWorker();

		expect(workbox.state.instances).toHaveLength(1);
		expect(workbox.state.instances[0].url).toBe('/service-worker.js');
		expect(workbox.state.instances[0].options).toEqual({ type: 'module' });
		expect(workbox.state.register).toHaveBeenCalledWith({ immediate: true });
	});

	test('reloads when an updated worker activates', () => {
		registerServiceWorker();

		workbox.state.instances[0].listeners.get('activated')?.({ isUpdate: true });

		expect(reload).toHaveBeenCalledTimes(1);
	});

	test('reloads when a worker installed from another tab activates', () => {
		registerServiceWorker();

		workbox.state.instances[0].listeners.get('activated')?.({ isExternal: true });

		expect(reload).toHaveBeenCalledTimes(1);
	});

	test('does not reload on the first activation', () => {
		registerServiceWorker();

		workbox.state.instances[0].listeners.get('activated')?.({});

		expect(reload).not.toHaveBeenCalled();
	});

	test('reports a failed registration to Sentry', async () => {
		const failure = new Error('registration failed');
		workbox.state.register.mockRejectedValue(failure);

		registerServiceWorker();
		await vi.waitFor(() => expect(captureException).toHaveBeenCalledWith(failure));
	});
});
