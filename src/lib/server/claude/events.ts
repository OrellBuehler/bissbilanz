import * as Sentry from '@sentry/sveltekit';

export type ClaudeAccessChange = { userId?: string };
type Listener = (change: ClaudeAccessChange) => void | Promise<void>;

const listeners = new Set<Listener>();

export function onClaudeAccessChanged(fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

const report = (error: unknown) => {
	Sentry.captureException(error, { tags: { job: 'claude-access-event' } });
};

export function emitClaudeAccessChanged(change: ClaudeAccessChange = {}): void {
	for (const fn of [...listeners]) {
		try {
			const result = fn(change);
			if (result) result.catch(report);
		} catch (error) {
			report(error);
		}
	}
}
