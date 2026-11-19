import * as Sentry from '@sentry/sveltekit';
import {
	EVENTS_PAGE_LIMIT,
	MAX_EVENT_STREAMS_PER_USER,
	SSE_HEARTBEAT_MS,
	SSE_MAX_DURATION_MS,
	SSE_POLL_MS
} from './constants';
import { listEvents, subscribeConversation, type ChatEventRecord } from './events';

export const SSE_RETRY_MS = 3000;

export const formatSseEvent = (event: ChatEventRecord): string =>
	`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

export type SseTiming = { heartbeatMs: number; pollMs: number; maxDurationMs: number };

// Open streams per user, oldest first. A new stream beyond the cap closes the
// oldest one (usually a connection the client already gave up on).
const openStreams = new Map<string, (() => void)[]>();

function register(userId: string, close: () => void): () => void {
	const streams = openStreams.get(userId) ?? [];
	streams.push(close);
	openStreams.set(userId, streams);
	while (streams.length > MAX_EVENT_STREAMS_PER_USER) streams.shift()!();
	return () => {
		const index = streams.indexOf(close);
		if (index !== -1) streams.splice(index, 1);
		if (streams.length === 0) openStreams.delete(userId);
	};
}

export const openStreamCount = (userId: string) => openStreams.get(userId)?.length ?? 0;

const DEFAULT_TIMING: SseTiming = {
	heartbeatMs: SSE_HEARTBEAT_MS,
	pollMs: SSE_POLL_MS,
	maxDurationMs: SSE_MAX_DURATION_MS
};

/**
 * Server-sent events of one conversation: everything after `after` from the
 * database, then new events as they are written (woken in-process, with a
 * database poll as a fallback). A comment line every heartbeatMs keeps proxies
 * and idle timeouts from closing the connection; the stream ends after
 * maxDurationMs and the client reconnects with Last-Event-ID.
 */
export function chatEventStream(
	userId: string,
	conversationId: string,
	after: number,
	signal: AbortSignal,
	timing: SseTiming = DEFAULT_TIMING
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let cursor = after;
	let closed = false;
	let cleanup = () => {};

	return new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (text: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(text));
				} catch (error) {
					Sentry.addBreadcrumb({
						category: 'chat-sse',
						level: 'info',
						message: 'SSE write after close',
						data: { error: error instanceof Error ? error.message : String(error) }
					});
					close();
				}
			};
			let pulling = false;
			let again = false;
			const pull = async () => {
				if (pulling) {
					again = true;
					return;
				}
				pulling = true;
				try {
					do {
						again = false;
						while (!closed) {
							const events = await listEvents(conversationId, cursor, EVENTS_PAGE_LIMIT);
							for (const event of events) {
								send(formatSseEvent(event));
								cursor = event.seq;
							}
							if (events.length < EVENTS_PAGE_LIMIT) break;
						}
					} while (again && !closed);
				} catch (error) {
					Sentry.captureException(error, { tags: { job: 'chat-sse' } });
					close();
				} finally {
					pulling = false;
				}
			};
			const close = () => {
				if (closed) return;
				closed = true;
				cleanup();
				try {
					controller.close();
				} catch (error) {
					Sentry.addBreadcrumb({
						category: 'chat-sse',
						level: 'info',
						message: 'SSE stream already closed',
						data: { error: error instanceof Error ? error.message : String(error) }
					});
				}
			};
			const unsubscribe = subscribeConversation(conversationId, () => void pull());
			const heartbeat = setInterval(() => send(': ping\n\n'), timing.heartbeatMs);
			const poll = setInterval(() => void pull(), timing.pollMs);
			const lifetime = setTimeout(close, timing.maxDurationMs);
			const onAbort = () => close();
			signal.addEventListener('abort', onAbort);
			const unregister = register(userId, close);
			cleanup = () => {
				unregister();
				unsubscribe();
				clearInterval(heartbeat);
				clearInterval(poll);
				clearTimeout(lifetime);
				signal.removeEventListener('abort', onAbort);
			};
			send(`retry: ${SSE_RETRY_MS}\n\n`);
			void pull();
		},
		cancel() {
			closed = true;
			cleanup();
		}
	});
}
