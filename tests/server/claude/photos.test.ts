import { beforeEach, describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
	ownsUpload: vi.fn(),
	stat: vi.fn(),
	readFile: vi.fn(),
	captureException: vi.fn()
}));

vi.mock('@sentry/sveltekit', () => ({ captureException: h.captureException }));
vi.mock('node:fs/promises', () => ({ stat: h.stat, readFile: h.readFile }));
vi.mock('$lib/server/images', () => ({
	UPLOAD_DIR: '/data/uploads',
	UPLOAD_FILENAME_PATTERN: /^[a-f0-9-]+\.webp$/,
	ownsUpload: h.ownsUpload
}));

const { loadTaskPhotos } = await import('$lib/server/claude/tasks/photos');

beforeEach(() => {
	for (const fn of Object.values(h)) fn.mockReset();
	h.ownsUpload.mockResolvedValue(true);
	h.stat.mockResolvedValue({ size: 1024 });
	h.readFile.mockResolvedValue(Buffer.from('bytes'));
});

describe('loadTaskPhotos', () => {
	test('returns base64 for owned photos in order', async () => {
		const result = await loadTaskPhotos('user-1', ['/uploads/aa-11.webp', '/uploads/bb-22.webp']);
		expect(result).toEqual([
			Buffer.from('bytes').toString('base64'),
			Buffer.from('bytes').toString('base64')
		]);
		expect(h.ownsUpload).toHaveBeenCalledWith('user-1', 'aa-11.webp');
		expect(h.readFile).toHaveBeenCalledWith('/data/uploads/aa-11.webp');
	});

	test('handles a task without photos', async () => {
		expect(await loadTaskPhotos('user-1', null)).toEqual([]);
		expect(await loadTaskPhotos('user-1', [])).toEqual([]);
	});

	test('skips names that are not upload filenames without touching disk', async () => {
		expect(await loadTaskPhotos('user-1', ['/uploads/../../etc/passwd', '/uploads/x.png'])).toEqual(
			[null, null]
		);
		expect(h.ownsUpload).not.toHaveBeenCalled();
		expect(h.readFile).not.toHaveBeenCalled();
	});

	test('skips photos the user does not own without touching disk', async () => {
		h.ownsUpload.mockResolvedValue(false);
		expect(await loadTaskPhotos('user-1', ['/uploads/aa-11.webp'])).toEqual([null]);
		expect(h.stat).not.toHaveBeenCalled();
	});

	test('skips photos over 4 MB', async () => {
		h.stat.mockResolvedValue({ size: 4 * 1024 * 1024 + 1 });
		expect(await loadTaskPhotos('user-1', ['/uploads/aa-11.webp'])).toEqual([null]);
		expect(h.readFile).not.toHaveBeenCalled();
	});

	test('reports unreadable files and carries on', async () => {
		h.readFile.mockRejectedValue(new Error('EIO'));
		expect(await loadTaskPhotos('user-1', ['/uploads/aa-11.webp'])).toEqual([null]);
		expect(h.captureException).toHaveBeenCalledWith(expect.any(Error), expect.anything());
	});
});
