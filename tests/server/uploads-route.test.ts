import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';
import { acceptsBearerAuth } from '$lib/server/auth-paths';

const { db, setResult, reset } = createMockDB();
const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const readFile = vi.hoisted(() => vi.fn());
vi.mock('node:fs/promises', () => ({ readFile }));

const { GET } = await import('../../src/routes/uploads/[filename]/+server');

const FILENAME = 'a1b2c3d4-0000-4000-8000-000000000001.webp';

const invoke = (opts: { user: typeof TEST_USER | null; filename?: string }) =>
	GET({
		params: { filename: opts.filename ?? FILENAME },
		locals: { user: opts.user }
	} as any);

const statusOf = async (result: unknown): Promise<number> => {
	try {
		return ((await result) as Response).status;
	} catch (err) {
		return (err as { status: number }).status;
	}
};

describe('uploads/[filename]', () => {
	beforeEach(() => {
		reset();
		readFile.mockReset();
		readFile.mockResolvedValue(Buffer.from('webp'));
	});

	test('bearer-authenticated owner gets the image', async () => {
		setResult([{ id: 'food-1' }]);
		const response = (await invoke({ user: TEST_USER })) as Response;

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('image/webp');
		expect(response.headers.get('Cache-Control')).toContain('private');
	});

	test("another user's image is 403, not served", async () => {
		setResult([]);
		expect(await statusOf(invoke({ user: TEST_USER }))).toBe(403);
		expect(readFile).not.toHaveBeenCalled();
	});

	test('no auth is 401', async () => {
		setResult([{ id: 'food-1' }]);
		expect(await statusOf(invoke({ user: null }))).toBe(401);
	});

	test('rejects filenames outside the upload pattern', async () => {
		expect(await statusOf(invoke({ user: TEST_USER, filename: '../../etc/passwd' }))).toBe(400);
	});

	test('missing file is 404', async () => {
		setResult([{ id: 'food-1' }]);
		readFile.mockRejectedValue(new Error('ENOENT'));
		expect(await statusOf(invoke({ user: TEST_USER }))).toBe(404);
	});
});

describe('acceptsBearerAuth', () => {
	test('accepts the API and the uploads route', () => {
		expect(acceptsBearerAuth('/api/foods')).toBe(true);
		expect(acceptsBearerAuth(`/uploads/${FILENAME}`)).toBe(true);
	});

	test('does not extend bearer auth to page routes', () => {
		expect(acceptsBearerAuth('/')).toBe(false);
		expect(acceptsBearerAuth('/foods')).toBe(false);
		expect(acceptsBearerAuth('/uploads')).toBe(false);
	});
});
