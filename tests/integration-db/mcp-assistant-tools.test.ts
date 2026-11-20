import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/schema';
import {
	closeTestDB,
	createTestDatabase,
	dropTestDatabase,
	getTestDB,
	runTestMigrations
} from './helpers';

const DB_NAME = 'test_mcp_assistant_tools';
let dbUrl: string;
let db: ReturnType<typeof getTestDB>;
let userId: string;

const call = async (name: string, args: Record<string, unknown>) => {
	const { createMcpServer } = await import('$lib/server/mcp/server');
	const server = createMcpServer(userId);
	const client = new Client({ name: 'assistant-tools', version: '0.0.0' });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	try {
		const result = await client.callTool({ name, arguments: args });
		return {
			isError: result.isError === true,
			payload: result.structuredContent as Record<string, any>
		};
	} finally {
		await client.close();
		await server.close();
	}
};

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({
		...schema,
		getDB: () => db,
		withDbRetry: <T>(fn: () => Promise<T>) => fn(),
		isTransientDbError: () => false
	}));
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

beforeEach(async () => {
	await db.delete(schema.users);
	const [user] = await db
		.insert(schema.users)
		.values({ infomaniakSub: `assistant-tools-${Date.now()}` })
		.returning();
	userId = user.id;
});

describe('meal type tools (integration)', () => {
	it('a rename carries the meal order, time windows and reminders; entries keep the old name', async () => {
		const created = await call('create_meal_type', { name: 'Pre-workout' });
		expect(created.isError).toBe(false);
		const mealTypeId = created.payload.mealTypeId as string;

		expect(
			(
				await call('update_preferences', {
					mealOrder: ['Breakfast', 'Pre-workout', 'Lunch', 'Dinner', 'Snacks'],
					favoriteMealTimeframes: [
						{
							mealType: 'Pre-workout',
							customMealTypeId: mealTypeId,
							startTime: '06:00',
							endTime: '07:00'
						},
						{ mealType: 'Lunch', startTime: '11:30', endTime: '14:00' }
					]
				})
			).isError
		).toBe(false);
		await call('create_reminder', { kind: 'meal', mealType: 'Pre-workout', time: '06:15' });
		await call('create_reminder', { kind: 'meal', mealType: 'lunch', time: '12:00' });
		const logged = await call('log_food', {
			quickName: 'Banana',
			quickCalories: 90,
			servings: 1,
			mealType: 'Pre-workout',
			date: '2026-11-19'
		});
		expect(logged.isError).toBe(false);

		const renamed = await call('update_meal_type', { mealTypeId, name: 'Pre-training' });
		expect(renamed).toMatchObject({ isError: false, payload: { success: true } });

		const preferences = (await call('get_preferences', {})).payload.preferences;
		expect(preferences.mealOrder).toEqual([
			'Breakfast',
			'Pre-training',
			'Lunch',
			'Dinner',
			'Snacks'
		]);
		expect(
			preferences.favoriteMealTimeframes.map((window: { mealType: string }) => window.mealType)
		).toEqual(['Pre-training', 'Lunch']);
		const reminders = (await call('list_reminders', {})).payload.reminders;
		expect(reminders.map((reminder: { mealType: string }) => reminder.mealType).sort()).toEqual([
			'Lunch',
			'Pre-training'
		]);
		const entries = await db
			.select({ mealType: schema.foodEntries.mealType })
			.from(schema.foodEntries)
			.where(eq(schema.foodEntries.userId, userId));
		expect(entries).toEqual([{ mealType: 'Pre-workout' }]);
	});

	it('refuses duplicate names and deleting a meal a time window uses', async () => {
		const { payload } = await call('create_meal_type', { name: 'Brunch' });
		expect((await call('create_meal_type', { name: 'brunch' })).payload).toEqual({
			error: 'A meal type named "brunch" already exists'
		});
		await call('update_preferences', {
			favoriteMealTimeframes: [
				{
					mealType: 'Brunch',
					customMealTypeId: payload.mealTypeId,
					startTime: '10:00',
					endTime: '11:00'
				}
			]
		});
		const refused = await call('delete_meal_type', { mealTypeId: payload.mealTypeId });
		expect(refused.isError).toBe(true);
		expect(refused.payload.error).toContain('favorites meal timeframes');

		await call('update_preferences', { favoriteMealTimeframes: [] });
		expect((await call('delete_meal_type', { mealTypeId: payload.mealTypeId })).payload).toEqual({
			success: true
		});
		expect((await call('list_meal_types', {})).payload.mealTypes).toEqual([]);
	});
});

describe('fasting and reminder tools (integration)', () => {
	it('logs, lists and edits fasts, and explains a range the database refuses', async () => {
		const logged = await call('log_fast', {
			startedAt: '2026-11-18T20:00:00+01:00',
			endedAt: '2026-11-19T12:30:00+01:00',
			targetHours: 16
		});
		expect(logged.payload).toMatchObject({
			success: true,
			fast: { durationMinutes: 990, targetReached: true }
		});
		const fastId = logged.payload.fastId as string;
		expect((await call('list_fasts', {})).payload.fasts).toHaveLength(1);

		const refused = await call('update_fast', { fastId, endedAt: '2026-11-18T18:00:00Z' });
		expect(refused).toEqual({
			isError: true,
			payload: { error: 'endedAt must be after startedAt' }
		});

		expect((await call('delete_fast', { fastId })).payload).toEqual({ success: true });
		expect((await call('delete_fast', { fastId })).payload).toEqual({ error: 'Fast not found' });
	});

	it('explains a meal type on a reminder that is not for a meal', async () => {
		const { payload } = await call('create_reminder', { kind: 'weight', time: '07:30' });
		expect(payload.reminder).toMatchObject({ kind: 'weight', weekdays: [0, 1, 2, 3, 4, 5, 6] });
		expect(
			(await call('update_reminder', { reminderId: payload.reminderId, mealType: 'Lunch' })).payload
		).toEqual({ error: "mealType is required when kind is 'meal', and must be omitted otherwise" });
		expect((await call('delete_reminder', { reminderId: payload.reminderId })).payload).toEqual({
			success: true
		});
	});

	it('update_preferences never touches the language or AI task routing', async () => {
		await call('update_preferences', {
			waterGoalMl: 2500,
			locale: 'de',
			aiTaskProcessor: 'claude',
			timeZone: 'Asia/Tokyo'
		});
		const preferences = (await call('get_preferences', {})).payload.preferences;
		expect(preferences).toMatchObject({
			waterGoalMl: 2500,
			locale: 'en',
			aiTaskProcessor: 'assistant',
			timeZone: 'UTC'
		});
	});
});
