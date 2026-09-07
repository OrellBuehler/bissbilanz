import { building } from '$app/environment';
import { isPushEnabled } from './config';
import { dispatchReminders } from './dispatch';

let started = false;
let running = false;

const tick = async () => {
	// A tick that overruns its minute must not stack up behind the next one.
	if (running) return;
	running = true;
	try {
		await dispatchReminders(new Date());
	} catch (error) {
		console.error('[push-reminders] Tick failed:', error);
	} finally {
		running = false;
	}
};

/**
 * Run the supplement reminder dispatcher once a minute for the lifetime of the
 * server process. No-op when Web Push is unconfigured, during the build, or
 * under test. Ticks are aligned to the wall-clock minute so a reminder set for
 * 08:00 fires within that minute.
 */
export const startReminderScheduler = () => {
	if (started || building || process.env.VITEST || process.env.NODE_ENV === 'test') return;
	if (!isPushEnabled()) return;
	started = true;

	const schedule = () => {
		const msToNextMinute = 60000 - (Date.now() % 60000);
		const timeout = setTimeout(() => {
			void tick();
			const interval = setInterval(() => void tick(), 60000);
			interval.unref?.();
		}, msToNextMinute);
		timeout.unref?.();
	};

	schedule();
	console.log('[push-reminders] Scheduler started');
};
