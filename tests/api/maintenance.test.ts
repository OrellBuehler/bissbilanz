import { describe, test, expect, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

vi.mock('$lib/paraglide/messages', () => ({ default: {} }));
vi.mock('@sentry/sveltekit', () => ({ captureException: vi.fn() }));

const mockWeights = [
	{ entryDate: '2026-02-01', weightKg: 80.0 },
	{ entryDate: '2026-02-14', weightKg: 79.0 }
];

const mockEntries = [
	{ date: '2026-02-01', calories: 2000, protein: 100, carbs: 200, fat: 80, fiber: 25, servings: 1 },
	{ date: '2026-02-02', calories: 1800, protein: 90, carbs: 180, fat: 70, fiber: 20, servings: 1 },
	{ date: '2026-02-03', calories: 2100, protein: 110, carbs: 210, fat: 85, fiber: 28, servings: 1 }
];

vi.mock('$lib/server/entries', () => ({
	listEntriesByDateRange: async () => mockEntries,
	listEntriesByDate: async () => ({ items: [], total: 0 }),
	createEntry: async () => ({ success: false, error: new Error('not implemented') }),
	updateEntry: async () => ({ success: false, error: new Error('not implemented') }),
	deleteEntry: async () => {},
	copyEntries: async () => [],
	toEntryUpdate: () => ({})
}));

vi.mock('$lib/server/db', async () => {
	const schema = await vi.importActual<typeof import('$lib/server/schema')>('$lib/server/schema');
	return {
		getDB: () => ({
			select: () => ({
				from: () => ({
					where: () => ({
						orderBy: async () => mockWeights
					})
				})
			})
		}),
		runMigrations: async () => {},
		...schema
	};
});

const { GET } = await import('../../src/routes/api/maintenance/+server');

describe('api/maintenance', () => {
	test('returns 401 when not authenticated', async () => {
		const event = createMockEvent({
			user: null,
			url: 'http://localhost/api/maintenance?startDate=2026-02-01&endDate=2026-02-14'
		});

		const response = await GET(event);
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toBe('Unauthorized');
	});

	test('returns 400 when date params are missing', async () => {
		const event = createMockEvent({
			user: TEST_USER,
			url: 'http://localhost/api/maintenance'
		});

		const response = await GET(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBeTruthy();
	});

	test('returns 400 when startDate format is invalid', async () => {
		const event = createMockEvent({
			user: TEST_USER,
			url: 'http://localhost/api/maintenance?startDate=not-a-date&endDate=2026-02-14'
		});

		const response = await GET(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBeTruthy();
	});

	test('returns 400 when endDate format is invalid', async () => {
		const event = createMockEvent({
			user: TEST_USER,
			url: 'http://localhost/api/maintenance?startDate=2026-02-01&endDate=14-02-2026'
		});

		const response = await GET(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBeTruthy();
	});

	test('returns 400 when muscleRatio is out of range', async () => {
		const event = createMockEvent({
			user: TEST_USER,
			url: 'http://localhost/api/maintenance?startDate=2026-02-01&endDate=2026-02-14&muscleRatio=1.5'
		});

		const response = await GET(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBeTruthy();
	});

	test('returns 400 when muscleRatio is not a number', async () => {
		const event = createMockEvent({
			user: TEST_USER,
			url: 'http://localhost/api/maintenance?startDate=2026-02-01&endDate=2026-02-14&muscleRatio=abc'
		});

		const response = await GET(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBeTruthy();
	});

	test('returns successful calculation with valid params', async () => {
		const event = createMockEvent({
			user: TEST_USER,
			url: 'http://localhost/api/maintenance?startDate=2026-02-01&endDate=2026-02-14'
		});

		const response = await GET(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.result).toBeTruthy();
		expect(data.result.maintenanceCalories).toBeGreaterThan(0);
		expect(data.result.totalEnergyBalance).toBeDefined();
		expect(data.meta).toBeTruthy();
		expect(data.meta.coverage).toBeDefined();
		expect(data.meta.totalDays).toBeDefined();
	});

	test('includes coverage in meta', async () => {
		const event = createMockEvent({
			user: TEST_USER,
			url: 'http://localhost/api/maintenance?startDate=2026-02-01&endDate=2026-02-14'
		});

		const response = await GET(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.meta.coverage).toBeGreaterThan(0);
		expect(data.meta.coverage).toBeLessThanOrEqual(1);
		expect(data.meta.foodEntryDays).toBe(3);
		expect(data.meta.totalDays).toBe(13);
	});
});
