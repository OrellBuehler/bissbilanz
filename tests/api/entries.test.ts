import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_ENTRY, VALID_ENTRY_PAYLOAD } from '../helpers/fixtures';

let mockListResult: any = [];
let mockCreateResult: any = null;

mock.module('$lib/server/entries', () => ({
	listEntriesByDate: async () => mockListResult,
	createEntry: async () => mockCreateResult,
	updateEntry: async () => null,
	deleteEntry: async () => {},
	listEntriesByDateRange: async () => [],
	copyEntries: async () => 0
}));

mock.module('$lib/server/validation', () => ({
	paginationSchema: {
		parse: (data: any) => ({
			limit: Number(data.limit) || 50,
			offset: Number(data.offset) || 0
		})
	}
}));

const { GET, POST } = await import('../../src/routes/api/entries/+server');

describe('api/entries', () => {
	beforeEach(() => {
		mockListResult = [];
		mockCreateResult = null;
	});

	describe('GET /api/entries', () => {
		test('returns 400 when date missing', async () => {
			const event = createMockEvent({ user: TEST_USER });
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('Missing date');
		});

		test('returns entries for date', async () => {
			mockListResult = [TEST_ENTRY];
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/entries?date=2026-02-10'
			});
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entries).toHaveLength(1);
		});
	});

	describe('POST /api/entries', () => {
		test('creates entry with valid payload', async () => {
			mockCreateResult = TEST_ENTRY;
			const event = createMockEvent({
				user: TEST_USER,
				body: VALID_ENTRY_PAYLOAD
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.entry).toBeTruthy();
		});
	});
});
