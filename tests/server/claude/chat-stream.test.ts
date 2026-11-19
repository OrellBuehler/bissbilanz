import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
	listEvents: vi.fn(),
	listeners: new Map<string, () => void>(),
	captureException: vi.fn(),
	addBreadcrumb: vi.fn()
}));

vi.mock('@sentry/sveltekit', () => ({
	captureException: h.captureException,
	addBreadcrumb: h.addBreadcrumb
}));
vi.mock('$lib/server/claude/chat/events', () => ({
	listEvents: h.listEvents,
	subscribeConversation: (id: string, listener: () => void) => {
		h.listeners.set(id, listener);
		return () => h.listeners.delete(id);
	}
}));

const { chatEventStream, formatSseEvent, SSE_RETRY_MS } =
	await import('$lib/server/claude/chat/stream');

const event = (seq: number, type = 'text_delta') => ({
	seq,
	type,
	createdAt: '2026-11-19T10:00:00.000Z',
	runId: 'r',
	messageId: 'm',
	partIndex: 0,
	text: `t${seq}`
});

const timing = { heartbeatMs: 1000, pollMs: 5000, maxDurationMs: 60_000 };
const decoder = new TextDecoder();

async function collect(reader: ReadableStreamDefaultReader<Uint8Array>) {
	let text = '';
	while (true) {
		const { value, done } = await reader.read();
		if (done) return text;
		text += decoder.decode(value);
	}
}

beforeEach(() => {
	vi.useFakeTimers();
	h.listEvents.mockReset();
	h.listeners.clear();
	h.captureException.mockReset();
	h.addBreadcrumb.mockReset();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('chat event stream', () => {
	test('formats one SSE message per event', () => {
		expect(formatSseEvent(event(4) as never)).toBe(
			`id: 4\nevent: text_delta\ndata: ${JSON.stringify(event(4))}\n\n`
		);
	});

	test('replays from after, follows notifications, pings and closes on abort', async () => {
		const pages: unknown[][] = [[event(3), event(4)], [event(5, 'run_finished')]];
		h.listEvents.mockImplementation(async () => pages.shift() ?? []);
		const abort = new AbortController();
		const reader = chatEventStream('c1', 2, abort.signal, timing).getReader();
		await vi.advanceTimersByTimeAsync(0);
		expect(h.listEvents).toHaveBeenNthCalledWith(1, 'c1', 2, 500);
		h.listeners.get('c1')!();
		await vi.advanceTimersByTimeAsync(0);
		expect(h.listEvents).toHaveBeenNthCalledWith(2, 'c1', 4, 500);
		await vi.advanceTimersByTimeAsync(1000);
		abort.abort();
		const text = await collect(reader);
		expect(text.startsWith(`retry: ${SSE_RETRY_MS}\n\n`)).toBe(true);
		expect(text).toContain('id: 3\nevent: text_delta\n');
		expect(text).toContain('id: 5\nevent: run_finished\n');
		expect(text).toContain(': ping\n\n');
		expect(h.listeners.has('c1')).toBe(false);
	});

	test('pages through a long backlog, coalesces wake-ups and polls as a fallback', async () => {
		const full = Array.from({ length: 500 }, (_, index) => event(index + 1));
		const pages: unknown[][] = [full, [event(501)], [event(502)]];
		let release!: () => void;
		h.listEvents.mockImplementation(async () => {
			if (pages.length === 1) await new Promise<void>((resolve) => (release = resolve));
			return pages.shift() ?? [];
		});
		const abort = new AbortController();
		const reader = chatEventStream('c1', 0, abort.signal, timing).getReader();
		await vi.advanceTimersByTimeAsync(0);
		h.listeners.get('c1')!();
		h.listeners.get('c1')!();
		release();
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(5000);
		abort.abort();
		const text = await collect(reader);
		expect(text).toContain('id: 500\n');
		expect(text).toContain('id: 502\n');
		expect(h.listEvents.mock.calls.map((call) => call[1])).toEqual(
			expect.arrayContaining([0, 500, 501, 502])
		);
	});

	test('ends after the maximum duration and when reading fails', async () => {
		h.listEvents.mockResolvedValue([]);
		const reader = chatEventStream('c1', 0, new AbortController().signal, {
			...timing,
			maxDurationMs: 2000
		}).getReader();
		await vi.advanceTimersByTimeAsync(2000);
		await collect(reader);

		h.listEvents.mockRejectedValue(new Error('db down'));
		const failing = chatEventStream('c2', 0, new AbortController().signal, timing).getReader();
		await vi.advanceTimersByTimeAsync(0);
		await collect(failing);
		expect(h.captureException).toHaveBeenCalled();
	});

	test('cleans up when the client cancels', async () => {
		h.listEvents.mockResolvedValue([]);
		const stream = chatEventStream('c1', 0, new AbortController().signal, timing);
		const reader = stream.getReader();
		await vi.advanceTimersByTimeAsync(0);
		await reader.cancel();
		expect(h.listeners.has('c1')).toBe(false);
		await vi.advanceTimersByTimeAsync(5000);
	});
});
