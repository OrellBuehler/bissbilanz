import { browser } from '$app/environment';
import { api } from '$lib/api/client';
import { apiFetch } from '$lib/utils/api';
import type { paths } from '$lib/api/generated/schema';

type AiTasksResponse =
	paths['/api/ai-tasks']['get']['responses']['200']['content']['application/json'];
export type AiTask = AiTasksResponse['tasks'][number];
export type AiTaskStatus = AiTask['status'];

let tasks = $state<AiTask[]>([]);
let loading = $state(false);
let loaded = $state(false);

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
}

async function remove(id: string): Promise<void> {
	const { response } = await api.DELETE('/api/ai-tasks/{id}', {
		params: { path: { id } }
	});
	if (!response.ok) {
		throw new Error('delete_failed');
	}
	tasks = tasks.filter((t) => t.id !== id);
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
	refresh,
	create,
	updateStatus,
	remove
};
