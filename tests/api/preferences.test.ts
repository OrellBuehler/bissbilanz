import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

let mockGetResult: any = null;
let mockUpdateResult: any = null;

const mockValidationError = new ZodError([
	{
		code: 'invalid_type',
		expected: 'boolean',
		path: ['showChartWidget'],
		message: 'Expected boolean, received string'
	} as any
]);

const TEST_PREFERENCES = {
	userId: TEST_USER.id,
	showChartWidget: true,
	showFavoritesWidget: true,
	showSupplementsWidget: true,
	showWeightWidget: true,
	showMealBreakdownWidget: true,
	showTopFoodsWidget: true,
	widgetOrder: [
		'chart',
		'favorites',
		'supplements',
		'weight',
		'meal-breakdown',
		'top-foods',
		'summary',
		'daylog'
	],
	startPage: 'dashboard',
	locale: 'en',
	favoriteTapAction: 'instant',
	favoriteMealAssignmentMode: 'time_based',
	visibleNutrients: ['calories', 'protein', 'carbs', 'fat', 'fiber'],
	favoriteMealTimeframes: [],
	updatedAt: new Date('2026-01-01T00:00:00Z')
};

vi.mock('$lib/server/preferences', () => ({
	getPreferences: async (_userId: string) => mockGetResult,
	updatePreferences: async (_userId: string, _payload: unknown) =>
		mockUpdateResult
			? { success: true, data: mockUpdateResult }
			: { success: false, error: mockValidationError },
	DEFAULT_PREFERENCES: {
		showChartWidget: true,
		showFavoritesWidget: true,
		showSupplementsWidget: true,
		showWeightWidget: true,
		showMealBreakdownWidget: true,
		showTopFoodsWidget: true,
		widgetOrder: [
			'chart',
			'favorites',
			'supplements',
			'weight',
			'meal-breakdown',
			'top-foods',
			'summary',
			'daylog'
		],
		startPage: 'dashboard',
		locale: 'en',
		favoriteTapAction: 'instant',
		favoriteMealAssignmentMode: 'time_based',
		visibleNutrients: [],
		favoriteMealTimeframes: []
	}
}));

const { GET, PATCH } = await import('../../src/routes/api/preferences/+server');

describe('api/preferences', () => {
	beforeEach(() => {
		mockGetResult = null;
		mockUpdateResult = null;
	});

	describe('GET /api/preferences', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });

			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns preferences when authenticated', async () => {
			mockGetResult = TEST_PREFERENCES;
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.preferences.showChartWidget).toBe(TEST_PREFERENCES.showChartWidget);
			expect(data.preferences.startPage).toBe(TEST_PREFERENCES.startPage);
			expect(data.preferences.locale).toBe(TEST_PREFERENCES.locale);
		});

		test('returns default preferences when user has no preferences', async () => {
			mockGetResult = null;
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.preferences).toBeTruthy();
			expect(data.preferences.showChartWidget).toBe(true);
		});
	});

	describe('PATCH /api/preferences', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				body: { showChartWidget: false },
				method: 'PATCH'
			});

			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('updates preferences with valid payload', async () => {
			mockUpdateResult = { ...TEST_PREFERENCES, showChartWidget: false };
			const event = createMockEvent({
				user: TEST_USER,
				body: { showChartWidget: false },
				method: 'PATCH'
			});

			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.preferences.showChartWidget).toBe(false);
		});

		test('handles partial update with only locale', async () => {
			mockUpdateResult = { ...TEST_PREFERENCES, locale: 'de' };
			const event = createMockEvent({
				user: TEST_USER,
				body: { locale: 'de' },
				method: 'PATCH'
			});

			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.preferences).toBeTruthy();
		});

		test('handles partial update with widget visibility flags', async () => {
			mockUpdateResult = {
				...TEST_PREFERENCES,
				showWeightWidget: false,
				showTopFoodsWidget: false
			};
			const event = createMockEvent({
				user: TEST_USER,
				body: { showWeightWidget: false, showTopFoodsWidget: false },
				method: 'PATCH'
			});

			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.preferences).toBeTruthy();
		});

		test('returns 400 when payload has invalid type for boolean field', async () => {
			mockUpdateResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				body: { showChartWidget: 'not-a-boolean' },
				method: 'PATCH'
			});

			const response = await PATCH(event);

			expect(response.status).toBe(400);
		});

		test('returns 400 with validation error message', async () => {
			mockUpdateResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				body: { showChartWidget: 'not-a-boolean' },
				method: 'PATCH'
			});

			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Validation failed');
		});
	});
});
