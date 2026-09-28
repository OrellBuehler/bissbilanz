import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER } from '../helpers/fixtures';

let mockImageUrl = '/uploads/abc123.webp';
let mockProcessError: Error | null = null;

vi.mock('$lib/server/images', () => ({
	processImage: async () => {
		if (mockProcessError) throw mockProcessError;
		return mockImageUrl;
	}
}));

const { POST } = await import('../../src/routes/api/images/upload/+server');

function upload(options: { user?: typeof TEST_USER | null; file?: File | null }) {
	const { user = TEST_USER, file } = options;
	const formData = new FormData();
	if (file) formData.append('image', file);
	const event = createMockEvent({ user });
	return {
		...event,
		request: new Request('http://localhost/api/images/upload', {
			method: 'POST',
			body: formData
		})
	} as typeof event;
}

const pngFile = () =>
	new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'photo.png', { type: 'image/png' });

describe('POST /api/images/upload', () => {
	beforeEach(() => {
		mockImageUrl = '/uploads/abc123.webp';
		mockProcessError = null;
	});

	test('returns 401 when not authenticated', async () => {
		const response = await POST(upload({ user: null, file: pngFile() }));
		await expectResponseContract('POST', '/api/images/upload', response);
		expect(response.status).toBe(401);
	});

	test('uploads an image and returns its URL', async () => {
		const response = await POST(upload({ file: pngFile() }));
		await expectResponseContract('POST', '/api/images/upload', response);
		const data = await response.json();
		expect(response.status).toBe(201);
		expect(data.imageUrl).toBe(mockImageUrl);
	});

	test('returns 400 when no file is provided', async () => {
		const response = await POST(upload({ file: null }));
		await expectResponseContract('POST', '/api/images/upload', response);
		expect(response.status).toBe(400);
	});

	test('returns 400 for a non-image file', async () => {
		const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
		const response = await POST(upload({ file: textFile }));
		await expectResponseContract('POST', '/api/images/upload', response);
		expect(response.status).toBe(400);
	});
});
