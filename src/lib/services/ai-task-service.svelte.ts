import { browser } from '$app/environment';
import { api } from '$lib/api/client';
import { apiFetch } from '$lib/utils/api';
import type { paths } from '$lib/api/generated/schema';

type AiTasksResponse =
	paths['/api/ai-tasks']['get']['responses']['200']['content']['application/json'];
export type AiTask = AiTasksResponse['tasks'][number];
export type AiTaskStatus = AiTask['status'];

// Which dismissals this browser has already announced. Server-side
// acknowledgement is what clears the badge, and it only happens when the user
// actually opens the list — so without a device-local record every refresh in
// the meantime would re-raise the same notification.
const NOTIFIED_KEY = 'ai-task-notified';

let tasks = $state<AiTask[]>([]);
let loading = $state(false);
let loaded = $state(false);

const isUnread = (task: AiTask) => task.status === 'dismissed' && !task.acknowledgedAt;

function readNotified(): Set<string> {
	if (!browser) return new Set();
	try {
		const raw = localStorage.getItem(NOTIFIED_KEY);
		return new Set(raw ? (JSON.parse(raw) as string[]) : []);
	} catch {
		return new Set();
	}
}

function writeNotified(ids: Set<string>): void {
	if (!browser) return;
	try {
		localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...ids]));
	} catch {
		// Private mode or blocked storage — worst case a notification repeats.
	}
}

function syncAppBadge(): void {
	if (!browser) return;
	const count = tasks.filter(isUnread).length;
	try {
		if (count > 0) void navigator.setAppBadge?.(count);
		else void navigator.clearAppBadge?.();
	} catch {
		// Unsupported or denied — the in-app badge still shows the count.
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
	} catch {
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

	// Drop ids the server no longer returns so the set cannot grow forever.
	const known = new Set(tasks.map((t) => t.id));
	const pruned = new Set([...notified].filter((id) => known.has(id)));
	for (const task of fresh) pruned.add(task.id);
	writeNotified(pruned);

	return fresh;
}

async function refresh(): Promise<void> {
	if (!browser) return;
	loading = true;
	try {
		const { data } = await api.GET('/api/ai-tasks', { params: { query: { limit: 100 } } });
		if (data) tasks = data.tasks;
	} catch {
		// fire-and-forget — offline or network error; keep showing stale state
	} finally {
		loading = false;
		loaded = true;
		syncAppBadge();
	}
}

async function uploadPhoto(file: File): Promise<string> {
	const formData = new FormData();
	formData.append('photo', file);
	const res = await apiFetch('/api/ai-tasks/photo', { method: 'POST', body: formData });
	if (!res.ok) {
		throw new Error('photo_upload_failed');
	}
	const body = (await res.json()) as { photoUrl: string };
	return body.photoUrl;
}

async function create(input: {
	description?: string;
	photoFile?: File | null;
	date: string;
	mealType?: string;
}): Promise<AiTask> {
	if (browser && !navigator.onLine) {
		throw new Error('offline');
	}

	const description = input.description?.trim();
	let photoUrl: string | undefined;
	if (input.photoFile) {
		photoUrl = await uploadPhoto(input.photoFile);
	}

	if (!description && !photoUrl) {
		throw new Error('missing_input');
	}

	const { data, error } = await api.POST('/api/ai-tasks', {
		body: {
			description: description || undefined,
			photoUrl,
			date: input.date,
			mealType: input.mealType || undefined,
			source: 'web'
		}
	});
	if (error || !data) {
		throw new Error('create_failed');
	}

	tasks = [data.task, ...tasks];
	return data.task;
}

async function updateStatus(id: string, status: AiTaskStatus): Promise<void> {
	const { data, error } = await api.PATCH('/api/ai-tasks/{id}', {
		params: { path: { id } },
		body: { status }
	});
	if (error || !data) {
		throw new Error('update_failed');
	}
	tasks = tasks.map((t) => (t.id === id ? data.task : t));
	syncAppBadge();
}

async function acknowledgeAll(): Promise<void> {
	if (!browser || !tasks.some(isUnread)) return;
	try {
		await api.POST('/api/ai-tasks/acknowledge', { body: {} });
		const seenAt = new Date().toISOString();
		tasks = tasks.map((t) => (isUnread(t) ? { ...t, acknowledgedAt: seenAt } : t));
	} catch {
		// Leave the badge up rather than pretending it was read.
	} finally {
		syncAppBadge();
	}
}

async function remove(id: string): Promise<void> {
	const { response } = await api.DELETE('/api/ai-tasks/{id}', {
		params: { path: { id } }
	});
	if (!response.ok) {
		throw new Error('delete_failed');
	}
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
		return tasks.filter(isUnread).length;
	},
	isUnread,
	refresh,
	create,
	updateStatus,
	acknowledgeAll,
	collectNewDismissals,
	showSystemNotification,
	remove
};
