import type Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/sveltekit';

// retry-after-ms (milliseconds) wins over retry-after (seconds or an HTTP date).
export function retryAfterMs(headers: Headers | undefined, now = Date.now()): number | undefined {
	const ms = Number(headers?.get('retry-after-ms') ?? NaN);
	if (Number.isFinite(ms) && ms >= 0) return ms;
	const value = headers?.get('retry-after');
	if (!value) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
	const date = Date.parse(value);
	return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

// Only the policy category leaves the server: the explanation can echo the request.
export function reportRefusal(response: Anthropic.Message, feature: string): void {
	if (response.stop_reason !== 'refusal') return;
	Sentry.captureMessage('Claude refused a request', {
		level: 'warning',
		tags: { model: response.model, feature, category: response.stop_details?.category ?? 'none' }
	});
}
