import { createFood, listFoods } from '$lib/server/foods';
import { createRecipe } from '$lib/server/recipes';
import { createEntry, listEntriesByDate } from '$lib/server/entries';
import { getGoals } from '$lib/server/goals';
import { formatDailyStatus } from '$lib/server/mcp/format';
import { today } from '$lib/utils/dates';
import { listSupplements, getLogsForDate, logSupplement, getSupplementById } from '$lib/server/supplements';
import { isSupplementDue } from '$lib/utils/supplements';

export const handleGetDailyStatus = async (userId: string, date?: string) => {
	const targetDate = date ?? today();
	const entries = await listEntriesByDate(userId, targetDate);
	const goals = await getGoals(userId);
	return formatDailyStatus({ entries, goals });
};

export const handleSearchFoods = async (userId: string, query: string) => {
	const foods = await listFoods(userId, { query });
	return { foods };
};

export const handleCreateFood = async (userId: string, payload: unknown) => {
	const result = await createFood(userId, payload);
	if (!result.success) throw result.error;
	return { foodId: result.data.id, success: true };
};

export const handleCreateRecipe = async (userId: string, payload: unknown) => {
	const result = await createRecipe(userId, payload);
	if (!result.success) throw result.error;
	return { recipeId: result.data.id, success: true };
};

export const handleLogFood = async (userId: string, payload: unknown) => {
	const result = await createEntry(userId, payload);
	if (!result.success) throw result.error;
	return { entryId: result.data.id, success: true };
};

export const handleGetSupplementStatus = async (userId: string) => {
	const targetDate = today();
	const now = new Date();

	const [allSupplements, logs] = await Promise.all([
		listSupplements(userId, true),
		getLogsForDate(userId, targetDate)
	]);

	const logMap = new Map(logs.map((l) => [l.supplementId, l]));

	const checklist = allSupplements
		.filter((s) => isSupplementDue(s.scheduleType, s.scheduleDays, s.scheduleStartDate, now))
		.map((s) => ({
			id: s.id,
			name: s.name,
			dosage: s.dosage,
			dosageUnit: s.dosageUnit,
			taken: logMap.has(s.id),
			takenAt: logMap.get(s.id)?.takenAt ?? null
		}));

	const taken = checklist.filter((c) => c.taken).length;
	return {
		date: targetDate,
		total: checklist.length,
		taken,
		pending: checklist.length - taken,
		supplements: checklist
	};
};

export const handleLogSupplement = async (
	userId: string,
	args: { name?: string; supplementId?: string; date?: string }
) => {
	const targetDate = args.date ?? today();
	let id = args.supplementId;

	// If name provided, search for matching supplement
	if (!id && args.name) {
		const allSupplements = await listSupplements(userId, true);
		const match = allSupplements.find(
			(s) => s.name.toLowerCase().includes(args.name!.toLowerCase())
		);
		if (!match) {
			return { success: false, error: `No supplement found matching "${args.name}"` };
		}
		id = match.id;
	}

	if (!id) {
		return { success: false, error: 'Provide either name or supplementId' };
	}

	const result = await logSupplement(userId, id, targetDate);
	if (!result.success) {
		return { success: false, error: result.error.message };
	}

	// Fetch supplement details for confirmation
	const supplement = await getSupplementById(userId, id);
	return {
		success: true,
		logged: {
			name: supplement?.name ?? 'Unknown',
			dosage: supplement?.dosage,
			dosageUnit: supplement?.dosageUnit,
			date: targetDate
		}
	};
};
