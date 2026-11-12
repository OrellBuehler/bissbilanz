import * as Sentry from '@sentry/sveltekit';
import { eq } from 'drizzle-orm';
import { getDB } from '../../db';
import { users } from '../../schema';
import { ClaudeApiError } from '../errors';
import { heartbeat } from './runs';
import type { Fence } from './types';

export async function loadLocale(userId: string): Promise<string | null> {
	const [owner] = await getDB()
		.select({ locale: users.locale })
		.from(users)
		.where(eq(users.id, userId));
	return owner?.locale ?? null;
}

export function startHeartbeat(fence: Fence, controller: AbortController, intervalMs: number) {
	let lost = false;
	const timer = setInterval(() => {
		heartbeat(fence)
			.then((alive) => {
				if (!alive) {
					lost = true;
					controller.abort();
				}
			})
			.catch((error) => {
				Sentry.captureException(error, { tags: { job: 'claude-heartbeat' } });
			});
	}, intervalMs);
	return { stop: () => clearInterval(timer), isLost: () => lost };
}

export const failureDetail = (error: unknown): string => {
	if (error instanceof ClaudeApiError) {
		return `${error.kind}${error.status === undefined ? '' : ` ${error.status}`}`;
	}
	return 'unexpected';
};
