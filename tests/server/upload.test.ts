import { describe, test, expect } from 'vitest';
import { readCappedFormData } from '../../src/lib/server/upload';
import { ApiError } from '../../src/lib/server/errors';

const MB = 1024 * 1024;

const multipart = (bytes: number) => {
	const body = new FormData();
	body.append('image', new File([new Uint8Array(bytes)], 'a.png', { type: 'image/png' }));
	return body;
};

describe('readCappedFormData', () => {
	test('parses a body within the cap', async () => {
		const request = new Request('http://localhost/upload', {
			method: 'POST',
			body: multipart(1024)
		});
		const form = await readCappedFormData(request, MB);
		expect((form.get('image') as File).size).toBe(1024);
	});

	test('rejects a declared Content-Length over the cap', async () => {
		const body = new ReadableStream({
			pull(controller) {
				controller.close();
			}
		});
		const request = new Request('http://localhost/upload', {
			method: 'POST',
			body,
			headers: {
				'content-length': String(50 * MB),
				'content-type': 'multipart/form-data; boundary=x'
			},
			// @ts-expect-error duplex is required for stream bodies
			duplex: 'half'
		});
		await expect(readCappedFormData(request, MB)).rejects.toMatchObject({ status: 400 });
	});

	test('aborts a chunked body that grows past the cap', async () => {
		const chunk = new Uint8Array(256 * 1024);
		let sent = 0;
		const body = new ReadableStream({
			pull(controller) {
				sent += 1;
				if (sent > 100) return controller.close();
				controller.enqueue(chunk);
			}
		});
		const request = new Request('http://localhost/upload', {
			method: 'POST',
			body,
			headers: { 'content-type': 'multipart/form-data; boundary=x' },
			// @ts-expect-error duplex is required for stream bodies
			duplex: 'half'
		});
		const error = await readCappedFormData(request, MB).catch((e) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(400);
		expect(error.message).toMatch(/1MB/);
		// Stopped long before the 25MB the stream could have supplied.
		expect(sent).toBeLessThan(20);
	});

	test('rejects a body that is not multipart', async () => {
		const request = new Request('http://localhost/upload', {
			method: 'POST',
			body: 'plain',
			headers: { 'content-type': 'text/plain' }
		});
		await expect(readCappedFormData(request, MB)).rejects.toMatchObject({ status: 400 });
	});
});
