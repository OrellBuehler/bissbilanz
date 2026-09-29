import * as Sentry from '@sentry/sveltekit';

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockNavigator = {
	wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

const report = (err: unknown) =>
	Sentry.logger.warn('Screen wake lock failed', { error: String(err) });

/**
 * Keep the screen on while cooking. The lock is dropped by the browser whenever
 * the tab is hidden, so it is re-requested when the page becomes visible again.
 * Unsupported browsers are ignored; a refused request is only logged.
 */
export const createScreenWakeLock = () => {
	let sentinel: WakeLockSentinelLike | null = null;
	let wanted = false;

	const request = async () => {
		const wakeLock = (navigator as WakeLockNavigator).wakeLock;
		if (!wanted || !wakeLock || sentinel || document.visibilityState !== 'visible') return;
		try {
			const lock = await wakeLock.request('screen');
			if (!wanted) {
				await lock.release().catch(report);
				return;
			}
			sentinel = lock;
			(lock as unknown as EventTarget).addEventListener?.('release', () => {
				if (sentinel === lock) sentinel = null;
			});
		} catch (err) {
			sentinel = null;
			report(err);
		}
	};

	const onVisibility = () => {
		if (document.visibilityState === 'visible') void request();
	};

	const acquire = () => {
		wanted = true;
		document.addEventListener('visibilitychange', onVisibility);
		return request();
	};

	const release = async () => {
		wanted = false;
		document.removeEventListener('visibilitychange', onVisibility);
		const current = sentinel;
		sentinel = null;
		await current?.release().catch(report);
	};

	return { acquire, release };
};
