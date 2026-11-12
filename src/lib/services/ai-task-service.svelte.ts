import { browser } from '$app/environment';
import * as Sentry from '@sentry/sveltekit';
import { api } from '$lib/api/client';
import { apiFetch, NO_QUEUE_HEADER } from '$lib/utils/api';
import { entryService } from '$lib/services/entry-service.svelte';
import {
	hasUnreadReply,
	newChangingReplies,
	unreadReplies,
	type ProposalAcceptBody
} from '$lib/utils/claude-tasks';
import { IDEMPOTENCY_KEY_HEADER } from '$lib/sync/contract';
import type { paths } from '$lib/api/generated/schema';

type AiTasksResponse =
	paths['/api/ai-tasks']['get']['responses']['200']['content']['application/json'];
export type AiTask = AiTasksResponse['tasks'][number];
export type AiTaskStatus = AiTask['status'];
export type AcceptResult = 'logged' | 'conflict' | 'failed';
// 'sent', 'offline', 'failed' (try again) or a rejection code from the server.
export type ReplyResult = 'sent' | 'offline' | 'failed' | (string & {});
export type NewReply = { task: AiTask; messageId: string; text: string };

// Which dismissals this browser has already announced. Server-side
// acknowledgement is what clears the badge, and it only happens when the user
// actually opens the list — so without a device-local record every refresh in
// the meantime would re-raise the same notification.
const NOTIFIED_KEY = 'ai-task-notified';
// The same for Claude's answers in a task's thread, by message id.
const REPLIES_NOTIFIED_KEY = 'ai-task-replies-notified';

let tasks = $state<AiTask[]>([]);
let loading = $state(false);
let loaded = $state(false);

// Bumped whenever a local accept or edit lands, so a list read that started
// earlier (and may predate it) is dropped instead of undoing the change.
let mutationGeneration = 0;
let pollInFlight = false;

const isUnread = (task: AiTask) => task.status === 'dismissed' && !task.acknowledgedAt;

const needsAttention = (task: AiTask) => isUnread(task) || hasUnreadReply(task);

function readNotified(key = NOTIFIED_KEY): Set<string> {
	if (!browser) return new Set();
	try {
		const raw = localStorage.getItem(key);
		return new Set(raw ? (JSON.parse(raw) as string[]) : []);
	} catch (err) {
		Sentry.captureException(err, { level: 'warning', extra: { context: 'readNotified' } });
		return new Set();
	}
}

function writeNotified(ids: Set<string>, key = NOTIFIED_KEY): void {
	if (!browser) return;
	try {
		localStorage.setItem(key, JSON.stringify([...ids]));
	} catch (err) {
		// Private mode or blocked storage — worst case a notification repeats.
		Sentry.captureException(err, { level: 'warning', extra: { context: 'writeNotified' } });
	}
}

function syncAppBadge(): void {
	if (!browser) return;
	const count = tasks.filter(needsAttention).length;
	try {
		if (count > 0) void navigator.setAppBadge?.(count);
		else void navigator.clearAppBadge?.();
	} catch (err) {
		// Unsupported or denied — the in-app badge still shows the count.
		Sentry.captureException(err, { level: 'warning', extra: { context: 'syncAppBadge' } });
	}
}

async function showSystemNotification(title: string, body: string): Promise<boolean> {
	if (!browser || !('Notification' in window) || Notification.permission !== 'granted') {
		return false;
	}
	try {
		// Chrome on Android forbids the Notification constructor for installed
		// PWAs, so go through the service worker registration where we can.
		if ('serviceWorker' in navigator) {
			const registration = await navigator.serviceWorker.getRegistration();
			if (registration) {
				await registration.showNotification(title, { body, tag: 'ai-task-dismissed' });
				return true;
			}
		}
		new Notification(title, { body, tag: 'ai-task-dismissed' });
		return true;
	} catch (err) {
		Sentry.captureException(err, { extra: { context: 'showSystemNotification' } });
		return false;
	}
}

/**
 * Announces dismissals this browser has not shown yet. Returns the tasks that
 * were announced so callers can also surface them in-app.
 */
async function collectNewDismissals(): Promise<AiTask[]> {
	if (!browser) return [];

	const notified = readNotified();
	const fresh = tasks.filter((t) => isUnread(t) && !notified.has(t.id));

	// Prune ids the server no longer returns so the set cannot grow forever — but
	// only against a list we actually got. A failed or not-yet-run refresh leaves
	// `tasks` empty, and pruning against that would clear the whole set and
	// re-announce every dismissal on the next successful refresh.
	if (tasks.length > 0) {
		const known = new Set(tasks.map((t) => t.id));
		const pruned = new Set([...notified].filter((id) => known.has(id)));
		for (const task of fresh) pruned.add(task.id);
		writeNotified(pruned);
	} else if (fresh.length > 0) {
		for (const task of fresh) notified.add(task.id);
		writeNotified(notified);
	}

	return fresh;
}

/**
 * Claude answers this browser has not announced yet, like collectNewDismissals.
 * Known message ids are pruned against the list so the set cannot grow forever.
 */
function collectNewReplies(): NewReply[] {
	if (!browser) return [];
	const notified = readNotified(REPLIES_NOTIFIED_KEY);
	const fresh = tasks.flatMap((task) =>
		unreadReplies(task)
			.filter((message) => !notified.has(message.id))
			.map((message) => ({ task, messageId: message.id, text: message.text }))
	);
	const known = new Set(
		tasks.flatMap((task) => (task.claudeThread?.messages ?? []).map((message) => message.id))
	);
	const kept = tasks.length > 0 ? [...notified].filter((id) => known.has(id)) : [...notified];
	writeNotified(new Set([...kept, ...fresh.map((reply) => reply.messageId)]), REPLIES_NOTIFIED_KEY);
	return fresh;
}

async function refresh(options: { quiet?: boolean } = {}): Promise<void> {
	if (!browser) return;
	loading = true;
	const generation = mutationGeneration;
	try {
		const { data } = await api.GET('/api/ai-tasks', { params: { query: { limit: 100 } } });
		if (data && generation === mutationGeneration) {
			// A correction that changed the diary is news for the day's entries too.
			if (loaded) {
				for (const task of newChangingReplies(tasks, data.tasks)) {
					void entryService.refresh(task.date);
				}
			}
			tasks = data.tasks;
		}
	} catch (err) {
		// fire-and-forget — offline or network error; keep showing stale state
		if (options.quiet) {
			Sentry.addBreadcrumb({
				category: 'ai-task',
				level: 'warning',
				message: 'ai task poll failed',
				data: { reason: err instanceof Error ? err.message : String(err) }
			});
		} else if (!(browser && !navigator.onLine)) {
			Sentry.captureException(err, { extra: { context: 'ai-task-service.refresh' } });
		}
	} finally {
		loading = false;
		loaded = true;
		syncAppBadge();
	}
}

/** One request per meal — the endpoint takes repeated `photo` parts. */
async function uploadPhotos(files: File[]): Promise<string[]> {
	const formData = new FormData();
	for (const file of files) formData.append('photo', file);
	const res = await apiFetch('/api/ai-tasks/photo', { method: 'POST', body: formData });
	if (!res.ok) {
		throw new Error('photo_upload_failed');
	}
	const body = (await res.json()) as { photoUrls: string[] };
	return body.photoUrls;
}

async function create(input: {
	description?: string;
	photoFiles?: File[];
	date: string;
	mealType?: string;
	eatenAt?: string;
}): Promise<AiTask> {
	if (browser && !navigator.onLine) {
		throw new Error('offline');
	}

	const description = input.description?.trim();
	const files = input.photoFiles ?? [];
	const photoUrls = files.length > 0 ? await uploadPhotos(files) : [];

	if (!description && photoUrls.length === 0) {
		throw new Error('missing_input');
	}

	const { data, error } = await api.POST('/api/ai-tasks', {
		body: {
			description: description || undefined,
			photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
			date: input.date,
			mealType: input.mealType || undefined,
			eatenAt: input.eatenAt || undefined,
			source: 'web'
		}
	});
	if (error || !data) {
		throw new Error('create_failed');
	}

	tasks = [data.task, ...tasks];
	return data.task;
}

async function update(
	id: string,
	input: {
		description?: string;
		photoUrls: string[];
		photoFiles?: File[];
		date: string;
		mealType?: string;
		eatenAt?: string;
	}
): Promise<AiTask> {
	if (browser && !navigator.onLine) {
		throw new Error('offline');
	}

	const description = input.description?.trim();
	const files = input.photoFiles ?? [];
	const photoUrls = [...input.photoUrls, ...(files.length > 0 ? await uploadPhotos(files) : [])];

	if (!description && photoUrls.length === 0) {
		throw new Error('missing_input');
	}

	const { data, error } = await api.PATCH('/api/ai-tasks/{id}', {
		params: { path: { id } },
		body: {
			description: description || null,
			photoUrls,
			date: input.date,
			mealType: input.mealType || null,
			eatenAt: input.eatenAt || null
		}
	});
	if (error || !data) {
		throw new Error('update_failed');
	}
	mutationGeneration++;
	tasks = tasks.map((t) => (t.id === id ? data.task : t));
	return data.task;
}

const isConflict = (status: number) => status === 409 || status === 404;

const isAcceptConflict = (status: number) => isConflict(status) || status === 400;

const noQueue = { [NO_QUEUE_HEADER]: '1' };

async function updateStatus(id: string, status: AiTaskStatus): Promise<void> {
	if (browser && !navigator.onLine) throw new Error('offline');
	let result;
	try {
		result = await api.PATCH('/api/ai-tasks/{id}', {
			params: { path: { id } },
			body: { status },
			headers: noQueue
		});
	} catch (err) {
		if (browser && !navigator.onLine) throw new Error('offline');
		throw err;
	}
	const { data, error, response } = result;
	if (isConflict(response.status)) {
		Sentry.addBreadcrumb({
			category: 'ai-task',
			level: 'info',
			message: 'ai task update rejected',
			data: { status: response.status }
		});
		await refresh();
		throw new Error('conflict');
	}
	if (error || !data?.task) {
		throw new Error('update_failed');
	}
	mutationGeneration++;
	tasks = tasks.map((t) => (t.id === id ? data.task : t));
	syncAppBadge();
}

async function acceptProposal(id: string, body: ProposalAcceptBody): Promise<AcceptResult> {
	if (browser && !navigator.onLine) return 'failed';
	try {
		const { data, response } = await api.POST('/api/ai-tasks/{id}/proposal/accept', {
			params: { path: { id } },
			body,
			headers: noQueue
		});
		if (isAcceptConflict(response.status)) {
			Sentry.addBreadcrumb({
				category: 'ai-task',
				level: 'info',
				message: 'ai task proposal accept rejected',
				data: { status: response.status }
			});
			await refresh();
			return 'conflict';
		}
		if (!data?.task) return 'failed';
		mutationGeneration++;
		tasks = tasks.map((t) => (t.id === id ? data.task : t));
		syncAppBadge();
		void entryService.refresh(data.task.date);
		return 'logged';
	} catch (err) {
		if (!(browser && !navigator.onLine)) {
			Sentry.captureException(err, { extra: { context: 'ai-task-service.acceptProposal' } });
		}
		return 'failed';
	}
}

/** Poll tick: one read at a time, failures are breadcrumbs, then clears the unread badge like opening the list. */
async function poll(): Promise<void> {
	if (pollInFlight) return;
	pollInFlight = true;
	try {
		await refresh({ quiet: true });
		await acknowledgeAll({ quiet: true });
	} finally {
		pollInFlight = false;
	}
}

async function acknowledgeAll(options: { quiet?: boolean } = {}): Promise<void> {
	if (!browser || !tasks.some(needsAttention)) return;
	try {
		await api.POST('/api/ai-tasks/acknowledge', { body: { replies: true } });
		const seenAt = new Date().toISOString();
		tasks = tasks.map((t) => {
			const seen = isUnread(t) ? { ...t, acknowledgedAt: seenAt } : t;
			if (!seen.claudeThread || !hasUnreadReply(seen)) return seen;
			return {
				...seen,
				claudeThread: {
					...seen.claudeThread,
					unreadReplies: 0,
					messages: seen.claudeThread.messages.map((m) => ({ ...m, unread: false }))
				}
			};
		});
	} catch (err) {
		// Leave the badge up rather than pretending it was read.
		if (options.quiet) {
			Sentry.addBreadcrumb({
				category: 'ai-task',
				level: 'warning',
				message: 'ai task acknowledge failed',
				data: { reason: err instanceof Error ? err.message : String(err) }
			});
		} else if (!(browser && !navigator.onLine)) {
			Sentry.captureException(err, { extra: { context: 'ai-task-service.acknowledgeAll' } });
		}
	} finally {
		syncAppBadge();
	}
}

const REJECTION_STATUSES = new Set([403, 404, 409, 429]);

/**
 * Sends a reply to Claude about a task it processed. Online only: a reply is a
 * request to Claude, not an edit to replay later. `idempotencyKey` stays the
 * same for retries of one reply so the server never records it twice.
 */
async function reply(id: string, text: string, idempotencyKey: string): Promise<ReplyResult> {
	if (browser && !navigator.onLine) return 'offline';
	try {
		const { data, error, response } = await api.POST('/api/ai-tasks/{id}/replies', {
			params: { path: { id } },
			body: { text },
			headers: { ...noQueue, [IDEMPOTENCY_KEY_HEADER]: idempotencyKey }
		});
		if (data?.task) {
			mutationGeneration++;
			tasks = tasks.map((t) => (t.id === id ? data.task : t));
			return 'sent';
		}
		if (REJECTION_STATUSES.has(response.status)) {
			Sentry.addBreadcrumb({
				category: 'ai-task',
				level: 'info',
				message: 'ai task reply rejected',
				data: { status: response.status }
			});
			void refresh({ quiet: true });
			const code = (error as { code?: unknown } | undefined)?.code;
			return typeof code === 'string' ? code : 'failed';
		}
		return 'failed';
	} catch (err) {
		if (browser && !navigator.onLine) return 'offline';
		Sentry.captureException(err, { extra: { context: 'ai-task-service.reply' } });
		return 'failed';
	}
}

async function remove(id: string): Promise<void> {
	const { response } = await api.DELETE('/api/ai-tasks/{id}', {
		params: { path: { id } }
	});
	if (!response.ok) {
		throw new Error('delete_failed');
	}
	mutationGeneration++;
	tasks = tasks.filter((t) => t.id !== id);
	syncAppBadge();
}

export const aiTaskService = {
	get tasks() {
		return tasks;
	},
	get loading() {
		return loading;
	},
	get loaded() {
		return loaded;
	},
	get unreadCount() {
		return tasks.filter(needsAttention).length;
	},
	isUnread,
	refresh,
	reply,
	collectNewReplies,
	poll,
	create,
	update,
	updateStatus,
	acceptProposal,
	acknowledgeAll,
	collectNewDismissals,
	showSystemNotification,
	remove
};
