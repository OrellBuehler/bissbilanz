import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER } from '../helpers/fixtures';

let mockPhotoUrls: string[] = ['/uploads/photo1.webp'];

vi.mock('$lib/server/images', () => ({
	AI_PHOTO_MAX_DIM: 1024,
	processImage: async () => mockPhotoUrls.shift() ?? '/uploads/fallback.webp'
}));

const { POST } = await import('../../src/routes/api/ai-tasks/photo/+server');

function upload(options: { user?: typeof TEST_USER | null; files?: File[] }) {
	const { user = TEST_USER, files = [] } = options;
	const formData = new FormData();
	for (const file of files) formData.append('photo', file);
	const event = createMockEvent({ user });
	return {
		...event,
		request: new Request('http://localhost/api/ai-tasks/photo', {
			method: 'POST',
			body: formData
		})
	} as typeof event;
}

const pngFile = (name = 'photo.png') =>
	new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' });

describe('POST /api/ai-tasks/photo', () => {
	beforeEach(() => {
		mockPhotoUrls = ['/uploads/photo1.webp', '/uploads/photo2.webp'];
	});

	test('returns 401 when not authenticated', async () => {
		const response = await POST(upload({ user: null, files: [pngFile()] }));
		await expectResponseContract('POST', '/api/ai-tasks/photo', response);
		expect(response.status).toBe(401);
	});

	test('uploads a single photo', async () => {
		const response = await POST(upload({ files: [pngFile()] }));
		await expectResponseContract('POST', '/api/ai-tasks/photo', response);
		const data = await response.json();
		expect(response.status).toBe(201);
		expect(data.photoUrl).toBe('/uploads/photo1.webp');
		expect(data.photoUrls).toEqual(['/uploads/photo1.webp']);
	});

	test('uploads multiple photos', async () => {
		const response = await POST(upload({ files: [pngFile('a.png'), pngFile('b.png')] }));
		await expectResponseContract('POST', '/api/ai-tasks/photo', response);
		const data = await response.json();
		expect(response.status).toBe(201);
		expect(data.photoUrls).toEqual(['/uploads/photo1.webp', '/uploads/photo2.webp']);
	});

	test('returns 400 when no file is provided', async () => {
		const response = await POST(upload({ files: [] }));
		await expectResponseContract('POST', '/api/ai-tasks/photo', response);
		expect(response.status).toBe(400);
	});

	test('returns 400 for a non-image file', async () => {
		const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
		const response = await POST(upload({ files: [textFile] }));
		await expectResponseContract('POST', '/api/ai-tasks/photo', response);
		expect(response.status).toBe(400);
	});
});
