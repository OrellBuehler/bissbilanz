import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createHandlers, type HandlerDeps } from '../../src/lib/server/mcp/create-handlers';
import { ApiError } from '../../src/lib/server/errors';
import { NutrientDatabaseError } from '../../src/lib/server/fooddata-central';
import { DEFAULT_PREFERENCES } from '../../src/lib/server/preferences';
import { fastingSessionUpsertSchema } from '../../src/lib/server/validation/fasting';

const USER = 'user-1';
const FAST_ID = '6f1c0f0e-0c1e-4a52-9d4e-6f4d2a0a7a01';
const REMINDER_ID = '0b0f6d9e-7b6e-4b61-9d52-3a1d1f6c9b02';
const MEAL_TYPE_ID = '3d6c2f1a-1b2c-4d3e-8f4a-5b6c7d8e9f03';
const OTHER_MEAL_TYPE_ID = '4e7d3a2b-2c3d-4e4f-9a5b-6c7d8e9fa004';

const ok = <T>(data: T) => ({ success: true as const, data });
const fail = (error: Error) => ({ success: false as const, error });

const pgError = (constraint: string) => {
	const cause = Object.assign(new Error('violates check constraint'), {
		name: 'PostgresError',
		code: '23514',
		constraint_name: constraint
	});
	return Object.assign(new Error('Failed query: update ...'), {
		name: 'DrizzleQueryError',
		cause
	});
};

const fastRow = {
	id: FAST_ID,
	userId: USER,
	startedAt: new Date('2026-11-18T19:00:00Z'),
	endedAt: new Date('2026-11-19T11:30:00Z'),
	targetHours: 16,
	createdAt: new Date('2026-11-19T11:30:00Z'),
	updatedAt: new Date('2026-11-19T11:30:00Z')
};

const reminderRow = {
	id: REMINDER_ID,
	userId: USER,
	kind: 'meal' as const,
	mealType: 'Lunch',
	time: '12:00',
	weekdays: [1, 2, 3, 4, 5],
	enabled: true,
	lastRemindedAt: null,
	createdAt: new Date('2026-11-01T00:00:00Z'),
	updatedAt: new Date('2026-11-01T00:00:00Z')
};

const mealTypeRow = {
	id: MEAL_TYPE_ID,
	userId: USER,
	name: 'Pre-workout',
	sortOrder: 3,
	createdAt: new Date('2026-11-01T00:00:00Z')
};

const deps = {
	listFastingSessions: vi.fn(),
	upsertFastingSession: vi.fn(),
	updateFastingSession: vi.fn(),
	deleteFastingSession: vi.fn(),
	listReminders: vi.fn(),
	getReminderById: vi.fn(),
	createReminder: vi.fn(),
	updateReminder: vi.fn(),
	deleteReminder: vi.fn(),
	getPreferences: vi.fn(),
	updatePreferences: vi.fn(),
	defaultPreferences: DEFAULT_PREFERENCES,
	listMealTypes: vi.fn(),
	createMealType: vi.fn(),
	updateMealType: vi.fn(),
	deleteMealType: vi.fn(),
	getFoodUsage: vi.fn(),
	getRecipeUsage: vi.fn(),
	listFoodBrands: vi.fn(),
	searchFdcFoods: vi.fn()
};

const h = createHandlers(deps as unknown as HandlerDeps);

beforeEach(() => {
	for (const value of Object.values(deps)) {
		if (typeof value === 'function' && 'mockReset' in value) value.mockReset();
	}
});

describe('fasting tools', () => {
	test('list_fasts passes the window through and adds the length and target result', async () => {
		deps.listFastingSessions.mockResolvedValue([
			fastRow,
			{ ...fastRow, id: 'short', endedAt: new Date('2026-11-19T05:00:00Z') }
		]);
		const args = { from: '2026-11-01T00:00:00+01:00', limit: 10 };
		expect(await h.handleListFasts(USER, args)).toEqual({
			fasts: [
				{
					id: FAST_ID,
					startedAt: fastRow.startedAt,
					endedAt: fastRow.endedAt,
					targetHours: 16,
					durationMinutes: 990,
					targetReached: true
				},
				expect.objectContaining({ id: 'short', durationMinutes: 600, targetReached: false })
			]
		});
		expect(deps.listFastingSessions).toHaveBeenCalledWith(USER, args);
	});

	test('log_fast records only the start, end and target', async () => {
		deps.upsertFastingSession.mockResolvedValue(ok(fastRow));
		const result = await h.handleLogFast(USER, {
			startedAt: '2026-11-18T20:00:00+01:00',
			endedAt: '2026-11-19T12:30:00+01:00',
			targetHours: 16,
			id: FAST_ID
		} as never);
		expect(result).toMatchObject({
			success: true,
			fastId: FAST_ID,
			fast: { durationMinutes: 990 }
		});
		expect(deps.upsertFastingSession).toHaveBeenCalledWith(USER, {
			startedAt: '2026-11-18T20:00:00+01:00',
			endedAt: '2026-11-19T12:30:00+01:00',
			targetHours: 16
		});
	});

	test('log_fast reports validation failures and an unsaved fast', async () => {
		const invalid = fastingSessionUpsertSchema.safeParse({
			startedAt: '2026-11-19T12:00:00Z',
			endedAt: '2026-11-19T10:00:00Z',
			targetHours: 16
		});
		if (invalid.success) throw new Error('expected a validation error');
		deps.upsertFastingSession.mockResolvedValue(fail(invalid.error));
		expect(
			await h.handleLogFast(USER, {
				startedAt: '2026-11-19T12:00:00Z',
				endedAt: '2026-11-19T10:00:00Z',
				targetHours: 16
			})
		).toEqual({
			error: 'validation_failed',
			issues: [{ path: 'endedAt', message: 'endedAt must be after startedAt' }]
		});
		deps.upsertFastingSession.mockResolvedValue(ok(undefined));
		expect(
			await h.handleLogFast(USER, {
				startedAt: '2026-11-19T08:00:00Z',
				endedAt: '2026-11-19T10:00:00Z',
				targetHours: 16
			})
		).toEqual({ error: 'The fast could not be saved' });
	});

	test('update_fast turns a range the database refuses into a readable error', async () => {
		deps.updateFastingSession.mockResolvedValue(ok({ ...fastRow, targetHours: 18 }));
		expect(await h.handleUpdateFast(USER, { fastId: FAST_ID, targetHours: 18 })).toMatchObject({
			success: true,
			fastId: FAST_ID,
			fast: { targetHours: 18, targetReached: false }
		});
		expect(deps.updateFastingSession).toHaveBeenCalledWith(USER, FAST_ID, { targetHours: 18 });

		deps.updateFastingSession.mockResolvedValue(fail(pgError('fasting_sessions_range_valid')));
		expect(
			await h.handleUpdateFast(USER, { fastId: FAST_ID, endedAt: '2026-11-18T18:00:00Z' })
		).toEqual({ error: 'endedAt must be after startedAt' });

		deps.updateFastingSession.mockResolvedValue(ok(undefined));
		expect(await h.handleUpdateFast(USER, { fastId: FAST_ID, targetHours: 18 })).toEqual({
			error: 'Fast not found'
		});
	});

	test('delete_fast reports a fast that is not the user’s', async () => {
		deps.deleteFastingSession.mockResolvedValue(true);
		expect(await h.handleDeleteFast(USER, { fastId: FAST_ID })).toEqual({ success: true });
		deps.deleteFastingSession.mockResolvedValue(false);
		expect(await h.handleDeleteFast(USER, { fastId: FAST_ID })).toEqual({
			error: 'Fast not found'
		});
	});

	test('database failures surface as tool errors without internals', async () => {
		deps.listFastingSessions.mockRejectedValue(new Error('connection reset'));
		await expect(h.handleListFasts(USER, {})).rejects.toThrow('Failed to list fasts');
		deps.deleteFastingSession.mockRejectedValue(new Error('connection reset'));
		await expect(h.handleDeleteFast(USER, { fastId: FAST_ID })).rejects.toThrow(
			'Failed to delete fast'
		);
		deps.upsertFastingSession.mockRejectedValue(new Error('connection reset'));
		await expect(
			h.handleLogFast(USER, { startedAt: 'a', endedAt: 'b', targetHours: 1 })
		).rejects.toThrow('Failed to log fast');
		deps.updateFastingSession.mockRejectedValue(new Error('connection reset'));
		await expect(h.handleUpdateFast(USER, { fastId: FAST_ID })).rejects.toThrow(
			'Failed to update fast'
		);
	});
});

describe('reminder tools', () => {
	const serialized = {
		id: REMINDER_ID,
		kind: 'meal',
		mealType: 'Lunch',
		time: '12:00',
		weekdays: [1, 2, 3, 4, 5],
		enabled: true
	};

	test('list_reminders returns the reminders without bookkeeping columns', async () => {
		deps.listReminders.mockResolvedValue([reminderRow]);
		expect(await h.handleListReminders(USER)).toEqual({ reminders: [serialized] });
	});

	test('create_reminder files a lowercase meal under its canonical name', async () => {
		deps.createReminder.mockResolvedValue(ok(reminderRow));
		expect(
			await h.handleCreateReminder(USER, { kind: 'meal', mealType: ' lunch ', time: '12:00' })
		).toEqual({ success: true, reminderId: REMINDER_ID, reminder: serialized });
		expect(deps.createReminder).toHaveBeenCalledWith(USER, {
			kind: 'meal',
			mealType: 'Lunch',
			time: '12:00'
		});

		deps.createReminder.mockResolvedValue(ok({ ...reminderRow, kind: 'weight', mealType: null }));
		await h.handleCreateReminder(USER, { kind: 'weight', time: '07:00' });
		expect(deps.createReminder).toHaveBeenLastCalledWith(USER, { kind: 'weight', time: '07:00' });

		deps.createReminder.mockResolvedValue(fail(new Error('Failed to create reminder')));
		expect(await h.handleCreateReminder(USER, { kind: 'weight', time: '07:00' })).toEqual({
			error: 'Failed to create reminder'
		});
	});

	test('update_reminder explains a meal type that does not fit the kind', async () => {
		deps.updateReminder.mockResolvedValue(ok({ ...reminderRow, time: '12:30' }));
		expect(await h.handleUpdateReminder(USER, { reminderId: REMINDER_ID, time: '12:30' })).toEqual({
			success: true,
			reminderId: REMINDER_ID,
			reminder: { ...serialized, time: '12:30' }
		});
		expect(deps.updateReminder).toHaveBeenCalledWith(USER, REMINDER_ID, { time: '12:30' });

		deps.updateReminder.mockResolvedValue(fail(pgError('reminders_meal_type_required')));
		expect(
			await h.handleUpdateReminder(USER, { reminderId: REMINDER_ID, mealType: 'snack' })
		).toEqual({ error: "mealType is required when kind is 'meal', and must be omitted otherwise" });
		expect(deps.updateReminder).toHaveBeenLastCalledWith(USER, REMINDER_ID, { mealType: 'Snacks' });

		deps.updateReminder.mockResolvedValue(fail(pgError('some_other_constraint')));
		expect(await h.handleUpdateReminder(USER, { reminderId: REMINDER_ID, time: '12:30' })).toEqual({
			error: 'Internal error. The request could not be completed.'
		});

		deps.updateReminder.mockResolvedValue(ok(undefined));
		expect(await h.handleUpdateReminder(USER, { reminderId: REMINDER_ID, time: '12:30' })).toEqual({
			error: 'Reminder not found'
		});
	});

	test('delete_reminder checks the reminder is the user’s before deleting', async () => {
		deps.getReminderById.mockResolvedValue(null);
		expect(await h.handleDeleteReminder(USER, { reminderId: REMINDER_ID })).toEqual({
			error: 'Reminder not found'
		});
		expect(deps.deleteReminder).not.toHaveBeenCalled();

		deps.getReminderById.mockResolvedValue(reminderRow);
		deps.deleteReminder.mockResolvedValue(undefined);
		expect(await h.handleDeleteReminder(USER, { reminderId: REMINDER_ID })).toEqual({
			success: true
		});
		expect(deps.deleteReminder).toHaveBeenCalledWith(USER, REMINDER_ID);
	});

	test('failures become tool errors', async () => {
		deps.listReminders.mockRejectedValue(new Error('down'));
		await expect(h.handleListReminders(USER)).rejects.toThrow('Failed to list reminders');
		deps.createReminder.mockRejectedValue(new Error('down'));
		await expect(h.handleCreateReminder(USER, { kind: 'sleep', time: '22:00' })).rejects.toThrow(
			'Failed to create reminder'
		);
		deps.updateReminder.mockRejectedValue(new Error('down'));
		await expect(h.handleUpdateReminder(USER, { reminderId: REMINDER_ID })).rejects.toThrow(
			'Failed to update reminder'
		);
		deps.getReminderById.mockRejectedValue(new Error('down'));
		await expect(h.handleDeleteReminder(USER, { reminderId: REMINDER_ID })).rejects.toThrow(
			'Failed to delete reminder'
		);
	});
});

describe('preference tools', () => {
	test('get_preferences returns the stored preferences, or the defaults', async () => {
		deps.getPreferences.mockResolvedValue({ userId: USER, showChartWidget: false, locale: 'de' });
		expect(await h.handleGetPreferences(USER)).toEqual({
			preferences: { showChartWidget: false, locale: 'de' }
		});
		deps.getPreferences.mockResolvedValue(null);
		expect(await h.handleGetPreferences(USER)).toEqual({ preferences: DEFAULT_PREFERENCES });
		deps.getPreferences.mockRejectedValue(new Error('down'));
		await expect(h.handleGetPreferences(USER)).rejects.toThrow('Failed to get preferences');
	});

	test('update_preferences writes only the allowed fields and returns what was stored', async () => {
		deps.updatePreferences.mockResolvedValue(
			ok({ waterGoalMl: 2000, showChartWidget: false, locale: 'en', aiTaskProcessor: 'assistant' })
		);
		expect(
			await h.handleUpdatePreferences(USER, {
				waterGoalMl: null,
				showChartWidget: false,
				locale: 'de',
				aiTaskProcessor: 'claude',
				aiTaskAutoLog: true,
				timeZone: 'Asia/Tokyo',
				biologicalSex: 'female',
				startPage: undefined
			})
		).toEqual({ success: true, preferences: { waterGoalMl: 2000, showChartWidget: false } });
		expect(deps.updatePreferences).toHaveBeenCalledWith(USER, {
			waterGoalMl: null,
			showChartWidget: false
		});
	});

	test('update_preferences refuses a call that changes nothing it may change', async () => {
		expect(await h.handleUpdatePreferences(USER, { locale: 'de' })).toEqual({
			error: 'Pass at least one preference to change'
		});
		expect(deps.updatePreferences).not.toHaveBeenCalled();
	});

	test('update_preferences passes refusals through', async () => {
		deps.updatePreferences.mockResolvedValue(
			fail(new ApiError(409, 'Favorite meal timeframes overlap'))
		);
		expect(
			await h.handleUpdatePreferences(USER, {
				favoriteMealTimeframes: [
					{ mealType: 'Breakfast', startTime: '06:00', endTime: '10:00' },
					{ mealType: 'Lunch', startTime: '09:00', endTime: '13:00' }
				]
			})
		).toEqual({ error: 'Favorite meal timeframes overlap' });
		deps.updatePreferences.mockResolvedValue(ok(undefined));
		expect(await h.handleUpdatePreferences(USER, { startPage: 'favorites' })).toEqual({
			success: true,
			preferences: { startPage: undefined }
		});
		deps.updatePreferences.mockRejectedValue(new Error('down'));
		await expect(h.handleUpdatePreferences(USER, { startPage: 'favorites' })).rejects.toThrow(
			'Failed to update preferences'
		);
	});
});

describe('meal type tools', () => {
	const preferences = {
		mealOrder: ['Breakfast', 'Pre-workout', 'Lunch', 'Dinner', 'Snacks'],
		favoriteMealTimeframes: [
			{
				id: 'tf-1',
				mealType: 'Pre-workout',
				customMealTypeId: MEAL_TYPE_ID,
				startMinute: 360,
				endMinute: 420,
				startTime: '06:00',
				endTime: '07:00',
				sortOrder: 0
			},
			{
				id: 'tf-2',
				mealType: 'Lunch',
				customMealTypeId: null,
				startMinute: 690,
				endMinute: 840,
				startTime: '11:30',
				endTime: '14:00',
				sortOrder: 1
			}
		]
	};

	test('create_meal_type refuses duplicates and default names, ignoring case', async () => {
		deps.listMealTypes.mockResolvedValue([mealTypeRow]);
		expect(await h.handleCreateMealType(USER, { name: 'pre-WORKOUT' })).toEqual({
			error: 'A meal type named "pre-WORKOUT" already exists'
		});
		expect(await h.handleCreateMealType(USER, { name: 'snack' })).toEqual({
			error: 'A meal type named "snack" already exists'
		});
		expect(deps.createMealType).not.toHaveBeenCalled();
	});

	test('create_meal_type adds the meal after the last custom one', async () => {
		deps.listMealTypes.mockResolvedValue([mealTypeRow]);
		const created = {
			...mealTypeRow,
			id: OTHER_MEAL_TYPE_ID,
			name: 'Second breakfast',
			sortOrder: 4
		};
		deps.createMealType.mockResolvedValue(ok(created));
		expect(await h.handleCreateMealType(USER, { name: '  Second breakfast ' })).toEqual({
			success: true,
			mealTypeId: OTHER_MEAL_TYPE_ID,
			mealType: created
		});
		expect(deps.createMealType).toHaveBeenCalledWith(USER, {
			name: 'Second breakfast',
			sortOrder: 4
		});

		deps.listMealTypes.mockResolvedValue([]);
		await h.handleCreateMealType(USER, { name: 'Brunch', sortOrder: 0 });
		expect(deps.createMealType).toHaveBeenLastCalledWith(USER, { name: 'Brunch', sortOrder: 0 });
		await h.handleCreateMealType(USER, { name: 'Brunch' });
		expect(deps.createMealType).toHaveBeenLastCalledWith(USER, { name: 'Brunch', sortOrder: 1 });

		deps.createMealType.mockResolvedValue(fail(new Error('Name is required')));
		expect(await h.handleCreateMealType(USER, { name: '   ' })).toEqual({
			error: 'Name is required'
		});
		deps.listMealTypes.mockRejectedValue(new Error('down'));
		await expect(h.handleCreateMealType(USER, { name: 'Brunch' })).rejects.toThrow(
			'Failed to create meal type'
		);
	});

	test('a rename carries the meal order, its time windows and its reminders', async () => {
		deps.listMealTypes.mockResolvedValue([mealTypeRow]);
		deps.getPreferences.mockResolvedValue(preferences);
		deps.updateMealType.mockResolvedValue(ok({ ...mealTypeRow, name: 'Pre-training' }));
		deps.listReminders.mockResolvedValue([
			{ ...reminderRow, id: 'r-meal', mealType: 'Pre-workout' },
			{ ...reminderRow, id: 'r-lunch' },
			{ ...reminderRow, id: 'r-weight', kind: 'weight', mealType: null }
		]);
		deps.updateReminder.mockResolvedValue(ok(reminderRow));
		deps.updatePreferences.mockResolvedValue(ok({}));

		expect(
			await h.handleUpdateMealType(USER, { mealTypeId: MEAL_TYPE_ID, name: ' Pre-training ' })
		).toEqual({
			success: true,
			mealTypeId: MEAL_TYPE_ID,
			mealType: { ...mealTypeRow, name: 'Pre-training' }
		});
		expect(deps.updateMealType).toHaveBeenCalledWith(USER, MEAL_TYPE_ID, { name: 'Pre-training' });
		expect(deps.updateReminder).toHaveBeenCalledTimes(1);
		expect(deps.updateReminder).toHaveBeenCalledWith(USER, 'r-meal', {
			kind: 'meal',
			mealType: 'Pre-training'
		});
		expect(deps.updatePreferences).toHaveBeenCalledWith(USER, {
			mealOrder: ['Breakfast', 'Pre-training', 'Lunch', 'Dinner', 'Snacks'],
			favoriteMealTimeframes: [
				{
					mealType: 'Pre-workout',
					customMealTypeId: MEAL_TYPE_ID,
					startTime: '06:00',
					endTime: '07:00'
				},
				{ mealType: 'Lunch', customMealTypeId: null, startTime: '11:30', endTime: '14:00' }
			]
		});
	});

	test('a rename leaves the time windows alone when none use the meal', async () => {
		deps.listMealTypes.mockResolvedValue([mealTypeRow]);
		deps.getPreferences.mockResolvedValue({
			...preferences,
			favoriteMealTimeframes: [preferences.favoriteMealTimeframes[1]]
		});
		deps.updateMealType.mockResolvedValue(ok({ ...mealTypeRow, name: 'Gym' }));
		deps.listReminders.mockResolvedValue([]);
		deps.updatePreferences.mockResolvedValue(ok({}));
		await h.handleUpdateMealType(USER, { mealTypeId: MEAL_TYPE_ID, name: 'Gym' });
		expect(deps.updatePreferences).toHaveBeenCalledWith(USER, {
			mealOrder: ['Breakfast', 'Gym', 'Lunch', 'Dinner', 'Snacks']
		});

		deps.updatePreferences.mockReset();
		deps.getPreferences.mockResolvedValue(null);
		await h.handleUpdateMealType(USER, { mealTypeId: MEAL_TYPE_ID, name: 'Gym' });
		expect(deps.updatePreferences).not.toHaveBeenCalled();
	});

	test('a sort order change or a same-name update touches nothing else', async () => {
		deps.listMealTypes.mockResolvedValue([mealTypeRow]);
		deps.updateMealType.mockResolvedValue(ok({ ...mealTypeRow, sortOrder: 7 }));
		await h.handleUpdateMealType(USER, { mealTypeId: MEAL_TYPE_ID, sortOrder: 7 });
		await h.handleUpdateMealType(USER, { mealTypeId: MEAL_TYPE_ID, name: 'Pre-workout' });
		expect(deps.updateMealType).toHaveBeenNthCalledWith(1, USER, MEAL_TYPE_ID, { sortOrder: 7 });
		expect(deps.updateMealType).toHaveBeenNthCalledWith(2, USER, MEAL_TYPE_ID, {
			name: 'Pre-workout'
		});
		expect(deps.getPreferences).not.toHaveBeenCalled();
		expect(deps.listReminders).not.toHaveBeenCalled();
	});

	test('update_meal_type refuses unknown ids, taken names and invalid input', async () => {
		deps.listMealTypes.mockResolvedValue([
			mealTypeRow,
			{ ...mealTypeRow, id: OTHER_MEAL_TYPE_ID, name: 'Brunch' }
		]);
		expect(await h.handleUpdateMealType(USER, { mealTypeId: 'not-mine', name: 'Gym' })).toEqual({
			error: 'Meal type not found'
		});
		expect(
			await h.handleUpdateMealType(USER, { mealTypeId: MEAL_TYPE_ID, name: 'brunch' })
		).toEqual({ error: 'A meal type named "brunch" already exists' });
		expect(
			await h.handleUpdateMealType(USER, { mealTypeId: MEAL_TYPE_ID, name: 'Dinner' })
		).toEqual({ error: 'A meal type named "Dinner" already exists' });
		deps.updateMealType.mockResolvedValue(fail(new Error('Name is required')));
		expect(await h.handleUpdateMealType(USER, { mealTypeId: MEAL_TYPE_ID, name: ' ' })).toEqual({
			error: 'Name is required'
		});
		deps.updateMealType.mockResolvedValue(ok(undefined));
		expect(await h.handleUpdateMealType(USER, { mealTypeId: MEAL_TYPE_ID, sortOrder: 1 })).toEqual({
			error: 'Meal type not found'
		});
	});

	test('a rename whose follow-up write fails is reported', async () => {
		deps.listMealTypes.mockResolvedValue([mealTypeRow]);
		deps.getPreferences.mockResolvedValue(preferences);
		deps.updateMealType.mockResolvedValue(ok({ ...mealTypeRow, name: 'Gym' }));
		deps.listReminders.mockResolvedValue([{ ...reminderRow, mealType: 'Pre-workout' }]);
		deps.updateReminder.mockResolvedValue(fail(new Error('Reminder update refused')));
		await expect(
			h.handleUpdateMealType(USER, { mealTypeId: MEAL_TYPE_ID, name: 'Gym' })
		).rejects.toThrow('Failed to update meal type');

		deps.listReminders.mockResolvedValue([]);
		deps.updatePreferences.mockResolvedValue(fail(new ApiError(400, 'Invalid range')));
		await expect(
			h.handleUpdateMealType(USER, { mealTypeId: MEAL_TYPE_ID, name: 'Gym' })
		).rejects.toThrow('Failed to update meal type');
	});

	test('delete_meal_type checks ownership and passes the time-window refusal through', async () => {
		deps.listMealTypes.mockResolvedValue([mealTypeRow]);
		expect(await h.handleDeleteMealType(USER, { mealTypeId: OTHER_MEAL_TYPE_ID })).toEqual({
			error: 'Meal type not found'
		});
		expect(deps.deleteMealType).not.toHaveBeenCalled();

		deps.deleteMealType.mockResolvedValue(undefined);
		expect(await h.handleDeleteMealType(USER, { mealTypeId: MEAL_TYPE_ID })).toEqual({
			success: true
		});

		deps.deleteMealType.mockRejectedValue(
			new ApiError(409, 'Meal type is used in favorites meal timeframes and cannot be deleted')
		);
		await expect(h.handleDeleteMealType(USER, { mealTypeId: MEAL_TYPE_ID })).rejects.toThrow(
			'Failed to delete meal type: Meal type is used in favorites meal timeframes and cannot be deleted'
		);
	});
});

describe('where-used, brands and the nutrient database', () => {
	const entries = Array.from({ length: 60 }, (_, i) => ({
		id: `e${i}`,
		date: '2026-11-19',
		mealType: 'Lunch',
		servings: 1,
		eatenAt: '2026-11-19T12:00:00.000Z'
	}));

	test('get_food_usage caps the entry list and keeps the total', async () => {
		deps.getFoodUsage.mockResolvedValue({
			totalEntries: 60,
			entries,
			recipes: [{ id: 'r', name: 'Porridge', isLastIngredient: false }],
			supplements: []
		});
		const result = await h.handleGetFoodUsage(USER, { foodId: 'f' });
		expect(result).toMatchObject({ totalEntries: 60, recipes: [{ name: 'Porridge' }] });
		expect((result as { entries: unknown[] }).entries).toHaveLength(50);
		expect(
			((await h.handleGetFoodUsage(USER, { foodId: 'f', limit: 5 })) as { entries: unknown[] })
				.entries
		).toHaveLength(5);
		deps.getFoodUsage.mockResolvedValue(null);
		expect(await h.handleGetFoodUsage(USER, { foodId: 'f' })).toEqual({ error: 'Food not found' });
		deps.getFoodUsage.mockRejectedValue(new Error('down'));
		await expect(h.handleGetFoodUsage(USER, { foodId: 'f' })).rejects.toThrow(
			'Failed to get food usage'
		);
	});

	test('get_recipe_usage caps the entry list and reports unknown recipes', async () => {
		deps.getRecipeUsage.mockResolvedValue({ totalEntries: 60, entries });
		expect(
			((await h.handleGetRecipeUsage(USER, { recipeId: 'r', limit: 3 })) as { entries: unknown[] })
				.entries
		).toHaveLength(3);
		deps.getRecipeUsage.mockResolvedValue(null);
		expect(await h.handleGetRecipeUsage(USER, { recipeId: 'r' })).toEqual({
			error: 'Recipe not found'
		});
		deps.getRecipeUsage.mockRejectedValue(new Error('down'));
		await expect(h.handleGetRecipeUsage(USER, { recipeId: 'r' })).rejects.toThrow(
			'Failed to get recipe usage'
		);
	});

	test('list_food_brands counts the brands', async () => {
		deps.listFoodBrands.mockResolvedValue([
			{ brand: 'Migros', count: 4 },
			{ brand: 'Coop', count: 2 }
		]);
		expect(await h.handleListFoodBrands(USER)).toEqual({
			total: 2,
			brands: [
				{ brand: 'Migros', count: 4 },
				{ brand: 'Coop', count: 2 }
			]
		});
		deps.listFoodBrands.mockRejectedValue(new Error('down'));
		await expect(h.handleListFoodBrands(USER)).rejects.toThrow('Failed to list food brands');
	});

	test('search_nutrient_database returns records per 100 g', async () => {
		deps.searchFdcFoods.mockResolvedValue([
			{
				fdcId: 169118,
				description: 'Pears, raw',
				dataType: 'SR Legacy',
				per100g: { calories: 57, protein: 0.4, carbs: 15.2, fat: 0.1, fiber: 3.1 },
				nutrients: { vitaminC: 4.3, potassium: 116 }
			}
		]);
		expect(await h.handleSearchNutrientDatabase(USER, { query: 'pear raw' })).toEqual({
			foods: [
				{
					fdcId: 169118,
					description: 'Pears, raw',
					dataType: 'SR Legacy',
					per100g: { calories: 57, protein: 0.4, carbs: 15.2, fat: 0.1, fiber: 3.1 },
					nutrientsPer100g: { vitaminC: 4.3, potassium: 116 }
				}
			]
		});
		expect(deps.searchFdcFoods).toHaveBeenCalledWith(USER, 'pear raw');
		deps.searchFdcFoods.mockResolvedValue([]);
		expect(await h.handleSearchNutrientDatabase(USER, { query: 'unobtainium' })).toEqual({
			foods: [],
			note: 'No records. Try a shorter English name, or use another source.'
		});
	});

	test('search_nutrient_database reports a missing key or outage as unavailable', async () => {
		deps.searchFdcFoods.mockRejectedValue(
			new NutrientDatabaseError('The nutrient database is not configured.')
		);
		expect(await h.handleSearchNutrientDatabase(USER, { query: 'pear' })).toEqual({
			foods: [],
			unavailable: true,
			hint: 'The nutrient database is not configured.'
		});
		deps.searchFdcFoods.mockRejectedValue(new Error('boom'));
		await expect(h.handleSearchNutrientDatabase(USER, { query: 'pear' })).rejects.toThrow(
			'Failed to search the nutrient database'
		);
	});
});
