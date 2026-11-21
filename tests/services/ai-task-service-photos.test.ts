import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ apiFetch: vi.fn(), prepareImage: vi.fn() }));

vi.mock('$lib/api/client', () => ({
	api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() }
}));

vi.mock('$lib/services/entry-service.svelte', () => ({
	entryService: { refresh: vi.fn() }
}));

vi.mock('$lib/utils/api', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/utils/api')>()),
	apiFetch: h.apiFetch
}));

vi.mock('$lib/ocr/image', () => ({ prepareImage: h.prepareImage }));

vi.mock('@sentry/sveltekit', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));

import { aiTaskService } from '../../src/lib/services/ai-task-service.svelte';
import { api } from '../../src/lib/api/client';
import * as Sentry from '@sentry/sveltekit';

const mockApi = api as unknown as {
	POST: ReturnType<typeof vi.fn>;
	PATCH: ReturnType<typeof vi.fn>;
};

const photoFiles = (count: number, size = 4000) =>
	Array.from(
		{ length: count },
		(_, index) => new File([new Uint8Array(size)], `IMG_${index}.heic`, { type: 'image/heic' })
	);

const urlsFor = (count: number) =>
	Array.from({ length: count }, (_, index) => `/uploads/${index}.webp`);

const uploadAnswers = (count: number) =>
	h.apiFetch.mockResolvedValue(
		new Response(JSON.stringify({ photoUrls: urlsFor(count) }), { status: 201 })
	);

const sentParts = () => {
	const body = h.apiFetch.mock.calls[0]![1].body as FormData;
	return body.getAll('photo') as File[];
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal('navigator', { onLine: true });
	mockApi.POST.mockResolvedValue({ data: { task: { id: 't1', photoUrls: [] } } });
	mockApi.PATCH.mockResolvedValue({ data: { task: { id: 't1', photoUrls: [] } } });
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('aiTaskService photos', () => {
	test('uploads ten photos in one request, downscaled and in order, and creates the task with all urls', async () => {
		h.prepareImage.mockImplementation(
			async () => new Blob([new Uint8Array(500)], { type: 'image/jpeg' })
		);
		uploadAnswers(10);

		await aiTaskService.create({
			description: 'lunch',
			photoFiles: photoFiles(10),
			date: '2026-11-21'
		});

		expect(h.apiFetch).toHaveBeenCalledTimes(1);
		expect(h.apiFetch.mock.calls[0]![0]).toBe('/api/ai-tasks/photo');
		const parts = sentParts();
		expect(parts.map((file) => file.name)).toEqual(
			Array.from({ length: 10 }, (_, index) => `IMG_${index}.jpg`)
		);
		expect(parts.every((file) => file.type === 'image/jpeg' && file.size === 500)).toBe(true);
		expect(mockApi.POST).toHaveBeenCalledWith('/api/ai-tasks', {
			body: expect.objectContaining({ photoUrls: urlsFor(10), source: 'web' })
		});
	});

	test('sends the original when the browser cannot decode the photo and leaves a breadcrumb', async () => {
		h.prepareImage.mockRejectedValue(new Error('cannot decode'));
		uploadAnswers(2);
		const files = photoFiles(2);

		await aiTaskService.create({ photoFiles: files, date: '2026-11-21' });

		expect(sentParts().map((file) => file.name)).toEqual(['IMG_0.heic', 'IMG_1.heic']);
		expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({
				category: 'ai-task',
				data: expect.objectContaining({ reason: 'cannot decode', type: 'image/heic' })
			})
		);
	});

	test('keeps the original when downscaling would not make it smaller', async () => {
		h.prepareImage.mockImplementation(
			async () => new Blob([new Uint8Array(9000)], { type: 'image/jpeg' })
		);
		uploadAnswers(1);

		await aiTaskService.create({ photoFiles: photoFiles(1), date: '2026-11-21' });

		expect(sentParts().map((file) => file.name)).toEqual(['IMG_0.heic']);
	});

	test('an edit keeps the existing urls and appends the newly uploaded ones', async () => {
		h.prepareImage.mockImplementation(
			async () => new Blob([new Uint8Array(10)], { type: 'image/jpeg' })
		);
		uploadAnswers(3);

		await aiTaskService.update('t1', {
			photoUrls: ['/uploads/old-1.webp', '/uploads/old-2.webp'],
			photoFiles: photoFiles(3),
			date: '2026-11-21'
		});

		expect(mockApi.PATCH).toHaveBeenCalledWith('/api/ai-tasks/{id}', {
			params: { path: { id: 't1' } },
			body: expect.objectContaining({
				photoUrls: ['/uploads/old-1.webp', '/uploads/old-2.webp', ...urlsFor(3)]
			})
		});
	});

	test('a failed upload stops before the task is created', async () => {
		h.prepareImage.mockImplementation(
			async () => new Blob([new Uint8Array(10)], { type: 'image/jpeg' })
		);
		h.apiFetch.mockResolvedValue(new Response('{}', { status: 400 }));

		await expect(
			aiTaskService.create({ photoFiles: photoFiles(10), date: '2026-11-21' })
		).rejects.toThrow('photo_upload_failed');
		expect(mockApi.POST).not.toHaveBeenCalled();
	});
});
