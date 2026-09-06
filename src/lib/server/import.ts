import { and, eq, inArray } from 'drizzle-orm';
import { unzipSync, strFromU8 } from 'fflate';
import { getDB } from './db';
import {
	dayProperties,
	foodEntries,
	foods,
	recipeIngredients,
	recipes,
	sleepEntries,
	supplementIngredients,
	supplements,
	weightEntries
} from './schema';
import { ApiError } from './errors';
import {
	importArchiveSchema,
	type ImportArchive,
	type ImportFormat,
	type ImportMode
} from './validation/import';
import { parseSleepCsv, parseWeightCsv, isInstant, type CsvIssue } from '$lib/import/csv';
import { zonedTimeToInstant } from '$lib/import/time';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_JSON_BYTES = 100 * 1024 * 1024;
const MAX_IMPORT_ROWS = 100_000;
const MAX_ISSUES = 50;
const MAX_SAMPLES = 5;

export type ImportSection = { name: string; toImport: number; skipped: number };

export type ImportSummary = {
	mode: ImportMode;
	format: ImportFormat;
	totalRows: number;
	imported: number;
	skipped: number;
	sections: ImportSection[];
	samples: string[];
	issues: CsvIssue[];
};

export type ParsedImport = {
	format: ImportFormat;
	data: ImportArchive;
	issues: CsvIssue[];
};

const isZip = (bytes: Uint8Array) =>
	bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);

function extractArchiveJson(bytes: Uint8Array): string {
	if (!isZip(bytes)) return strFromU8(bytes);
	// Only the canonical JSON is inflated, and only below a size cap, so a
	// 20MB upload can't expand into gigabytes of heap.
	const files = unzipSync(bytes, {
		filter: (file) =>
			file.name.endsWith('bissbilanz.json') && file.originalSize <= MAX_ARCHIVE_JSON_BYTES
	});
	const entry = Object.values(files)[0];
	if (!entry) {
		throw new ApiError(400, 'The archive does not contain a readable bissbilanz.json');
	}
	return strFromU8(entry);
}

function detectCsvFormat(text: string): ImportFormat | null {
	const header = (text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '').toLowerCase();
	if (/bedtime|wake|duration|dauer|schlaf/.test(header)) return 'sleep-csv';
	if (/weight|kg|gewicht/.test(header)) return 'weight-csv';
	return null;
}

export async function parseImportFile(
	file: File,
	timeZone: string,
	hint?: ImportFormat
): Promise<ParsedImport> {
	if (file.size > MAX_IMPORT_BYTES) {
		throw new ApiError(400, 'File must be 20MB or smaller');
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (bytes.length === 0) throw new ApiError(400, 'The file is empty');

	const name = file.name.toLowerCase();
	const looksLikeArchive = isZip(bytes) || name.endsWith('.json');
	const format: ImportFormat =
		hint ??
		(looksLikeArchive
			? 'archive'
			: (detectCsvFormat(strFromU8(bytes.slice(0, 4096))) ?? 'archive'));

	if (format === 'archive') {
		let parsed: unknown;
		try {
			parsed = JSON.parse(extractArchiveJson(bytes));
		} catch (error) {
			if (error instanceof ApiError) throw error;
			throw new ApiError(400, 'Unrecognized file: expected a Bissbilanz export or a CSV file');
		}
		const result = importArchiveSchema.safeParse(parsed);
		if (!result.success) {
			return {
				format,
				data: {},
				issues: result.error.issues.slice(0, MAX_ISSUES).map((issue) => ({
					row: 0,
					message: `${issue.path.join('.') || 'file'}: ${issue.message}`
				}))
			};
		}
		return { format, data: result.data, issues: [] };
	}

	const text = strFromU8(bytes);
	if (format === 'weight-csv') {
		const { rows, issues } = parseWeightCsv(text);
		return {
			format,
			data: {
				weightEntries: rows.map((row) => ({
					entryDate: row.entryDate,
					weightKg: row.weightKg,
					notes: row.notes,
					loggedAt: `${row.entryDate}T12:00:00.000Z`
				}))
			},
			issues
		};
	}

	const { rows, issues } = parseSleepCsv(text);
	const converted: NonNullable<ImportArchive['sleepEntries']> = [];
	for (const [index, row] of rows.entries()) {
		const toInstant = (value: string | null) =>
			value === null
				? null
				: isInstant(value)
					? value
					: zonedTimeToInstant(row.entryDate, value, timeZone);
		const bedtime = toInstant(row.bedtime);
		// A wake time at or before bedtime belongs to the next morning
		let wakeTime = toInstant(row.wakeTime);
		if (bedtime && wakeTime && new Date(wakeTime) <= new Date(bedtime)) {
			wakeTime = new Date(new Date(wakeTime).getTime() + 86_400_000).toISOString();
		}
		if ((row.bedtime && !bedtime) || (row.wakeTime && !wakeTime)) {
			issues.push({ row: index + 2, message: 'Could not resolve bedtime or wake time' });
			continue;
		}
		converted.push({
			entryDate: row.entryDate,
			durationMinutes: row.durationMinutes,
			quality: row.quality,
			bedtime,
			wakeTime,
			notes: row.notes,
			loggedAt: `${row.entryDate}T12:00:00.000Z`
		});
	}
	return { format, data: { sleepEntries: converted }, issues };
}

const toDate = (value: string | null | undefined, fallback: Date): Date => {
	if (!value) return fallback;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? fallback : date;
};

const countRows = (data: ImportArchive): number =>
	(data.foods?.length ?? 0) +
	(data.recipes?.length ?? 0) +
	(data.recipeIngredients?.length ?? 0) +
	(data.supplements?.length ?? 0) +
	(data.supplementIngredients?.length ?? 0) +
	(data.entries?.length ?? 0) +
	(data.weightEntries?.length ?? 0) +
	(data.sleepEntries?.length ?? 0) +
	(data.dayProperties?.length ?? 0);

type OwnedRow = { id: string; userId: string };

function splitOwnership(userId: string, rows: OwnedRow[]) {
	const owned = new Set<string>();
	const foreign = new Set<string>();
	for (const row of rows) {
		if (row.userId === userId) owned.add(row.id);
		else foreign.add(row.id);
	}
	return { owned, foreign };
}

/** Postgres caps a statement at 65535 parameters, and `foods` is ~60 columns wide. */
const CHUNK_SIZE = 500;

async function inChunks<T>(
	rows: T[],
	run: (part: T[]) => Promise<unknown>,
	size = CHUNK_SIZE
): Promise<void> {
	for (let index = 0; index < rows.length; index += size) {
		await run(rows.slice(index, index + size));
	}
}

async function collect<T, R>(values: T[], run: (part: T[]) => Promise<R[]>): Promise<R[]> {
	const results: R[] = [];
	for (let index = 0; index < values.length; index += 1000) {
		results.push(...(await run(values.slice(index, index + 1000))));
	}
	return results;
}

const dedupeBy = <T>(rows: T[], key: (row: T) => string): T[] => {
	const seen = new Set<string>();
	return rows.filter((row) => {
		const value = key(row);
		if (seen.has(value)) return false;
		seen.add(value);
		return true;
	});
};

/**
 * Plans an import: resolves which rows are new, which already exist (skipped so
 * a re-import is a no-op) and which reference records the user does not own.
 */
async function planImport(userId: string, data: ImportArchive) {
	const db = getDB();
	const issues: CsvIssue[] = [];
	const sections: ImportSection[] = [];
	const samples: string[] = [];

	const addSample = (line: string) => {
		if (samples.length < MAX_SAMPLES) samples.push(line);
	};

	const foodRows = dedupeBy(data.foods ?? [], (row) => row.id);
	const recipeRows = dedupeBy(data.recipes ?? [], (row) => row.id);
	const supplementRows = dedupeBy(data.supplements ?? [], (row) => row.id);

	const foodIds = foodRows.map((row) => row.id);
	const recipeIds = recipeRows.map((row) => row.id);
	const supplementIds = supplementRows.map((row) => row.id);

	const [foodOwners, recipeOwners, supplementOwners] = await Promise.all([
		collect(foodIds, (part) =>
			db.select({ id: foods.id, userId: foods.userId }).from(foods).where(inArray(foods.id, part))
		),
		collect(recipeIds, (part) =>
			db
				.select({ id: recipes.id, userId: recipes.userId })
				.from(recipes)
				.where(inArray(recipes.id, part))
		),
		collect(supplementIds, (part) =>
			db
				.select({ id: supplements.id, userId: supplements.userId })
				.from(supplements)
				.where(inArray(supplements.id, part))
		)
	]);

	const foodState = splitOwnership(userId, foodOwners);
	const recipeState = splitOwnership(userId, recipeOwners);
	const supplementState = splitOwnership(userId, supplementOwners);

	const newFoods = foodRows.filter(
		(row) => !foodState.owned.has(row.id) && !foodState.foreign.has(row.id)
	);
	const newRecipes = recipeRows.filter(
		(row) => !recipeState.owned.has(row.id) && !recipeState.foreign.has(row.id)
	);
	const newSupplements = supplementRows.filter(
		(row) => !supplementState.owned.has(row.id) && !supplementState.foreign.has(row.id)
	);

	for (const row of foodRows) {
		if (foodState.foreign.has(row.id)) {
			issues.push({
				row: 0,
				message: `Food "${row.name}" conflicts with another account's record`
			});
		}
	}

	const usableFoods = new Set([...foodState.owned, ...newFoods.map((row) => row.id)]);
	const usableRecipes = new Set([...recipeState.owned, ...newRecipes.map((row) => row.id)]);
	const usableSupplements = new Set([
		...supplementState.owned,
		...newSupplements.map((row) => row.id)
	]);

	for (const row of newFoods.slice(0, MAX_SAMPLES)) addSample(`${row.name} (${row.calories} kcal)`);

	// Ingredients are re-created only for recipes/supplements this import adds,
	// so an existing recipe is never silently duplicated or re-stuffed.
	const newRecipeIds = new Set(newRecipes.map((row) => row.id));
	const newSupplementIds = new Set(newSupplements.map((row) => row.id));
	const newRecipeIngredients = (data.recipeIngredients ?? []).filter(
		(row) => newRecipeIds.has(row.recipeId) && usableFoods.has(row.foodId)
	);
	const newSupplementIngredients = (data.supplementIngredients ?? []).filter(
		(row) => newSupplementIds.has(row.supplementId) && usableFoods.has(row.foodId)
	);

	const entryRows = dedupeBy(data.entries ?? [], (row) => row.id);
	const existingEntryIds = new Set(
		(
			await collect(
				entryRows.map((row) => row.id),
				(part) =>
					db.select({ id: foodEntries.id }).from(foodEntries).where(inArray(foodEntries.id, part))
			)
		).map((row) => row.id)
	);
	const newEntries = entryRows.filter((row) => {
		if (existingEntryIds.has(row.id)) return false;
		if (row.foodId && !usableFoods.has(row.foodId)) {
			issues.push({ row: 0, message: `Entry on ${row.date} references an unknown food` });
			return false;
		}
		if (row.recipeId && !usableRecipes.has(row.recipeId)) {
			issues.push({ row: 0, message: `Entry on ${row.date} references an unknown recipe` });
			return false;
		}
		if (row.supplementId && !usableSupplements.has(row.supplementId)) return false;
		// food_entries_has_source: a row with neither a source nor quick calories
		// would abort the whole transaction on the CHECK constraint
		if (!row.foodId && !row.recipeId && row.quickCalories == null) {
			issues.push({ row: 0, message: `Entry on ${row.date} has no food, recipe or calories` });
			return false;
		}
		return true;
	});

	const weightRows = dedupeBy(data.weightEntries ?? [], (row) => row.entryDate);
	const sleepRows = dedupeBy(data.sleepEntries ?? [], (row) => row.entryDate);
	const dayRows = dedupeBy(data.dayProperties ?? [], (row) => row.date);

	const existingWeightDates = await existingDates(
		userId,
		'weight',
		weightRows.map((r) => r.entryDate)
	);
	const existingSleepDates = await existingDates(
		userId,
		'sleep',
		sleepRows.map((r) => r.entryDate)
	);
	const existingDayDates = await existingDates(
		userId,
		'day',
		dayRows.map((r) => r.date)
	);

	const newWeight = weightRows.filter((row) => !existingWeightDates.has(row.entryDate));
	const newSleep = sleepRows.filter((row) => !existingSleepDates.has(row.entryDate));
	const newDays = dayRows.filter((row) => !existingDayDates.has(row.date));

	for (const row of newWeight.slice(0, MAX_SAMPLES))
		addSample(`${row.entryDate} — ${row.weightKg} kg`);
	for (const row of newSleep.slice(0, MAX_SAMPLES)) {
		addSample(
			`${row.entryDate} — ${Math.floor(row.durationMinutes / 60)}h ${row.durationMinutes % 60}m, quality ${row.quality}`
		);
	}

	const section = (name: string, total: number, planned: number) => {
		if (total > 0) sections.push({ name, toImport: planned, skipped: total - planned });
	};
	section('foods', foodRows.length, newFoods.length);
	section('recipes', recipeRows.length, newRecipes.length);
	section('supplements', supplementRows.length, newSupplements.length);
	section('entries', entryRows.length, newEntries.length);
	section('weight', weightRows.length, newWeight.length);
	section('sleep', sleepRows.length, newSleep.length);
	section('dayProperties', dayRows.length, newDays.length);

	return {
		issues,
		sections,
		samples,
		newFoods,
		newRecipes,
		newRecipeIngredients,
		newSupplements,
		newSupplementIngredients,
		newEntries,
		newWeight,
		newSleep,
		newDays
	};
}

async function existingDates(
	userId: string,
	kind: 'weight' | 'sleep' | 'day',
	dates: string[]
): Promise<Set<string>> {
	const found = new Set<string>();
	if (dates.length === 0) return found;
	const db = getDB();
	if (kind === 'weight') {
		const rows = await collect(dates, (part) =>
			db
				.select({ date: weightEntries.entryDate })
				.from(weightEntries)
				.where(and(eq(weightEntries.userId, userId), inArray(weightEntries.entryDate, part)))
		);
		for (const row of rows) found.add(row.date);
	} else if (kind === 'sleep') {
		const rows = await collect(dates, (part) =>
			db
				.select({ date: sleepEntries.entryDate })
				.from(sleepEntries)
				.where(and(eq(sleepEntries.userId, userId), inArray(sleepEntries.entryDate, part)))
		);
		for (const row of rows) found.add(row.date);
	} else {
		const rows = await collect(dates, (part) =>
			db
				.select({ date: dayProperties.date })
				.from(dayProperties)
				.where(and(eq(dayProperties.userId, userId), inArray(dayProperties.date, part)))
		);
		for (const row of rows) found.add(row.date);
	}
	return found;
}

export async function runImport(
	userId: string,
	parsed: ParsedImport,
	mode: ImportMode
): Promise<ImportSummary> {
	const totalRows = countRows(parsed.data);
	if (totalRows > MAX_IMPORT_ROWS) {
		throw new ApiError(400, `File contains too many rows (max ${MAX_IMPORT_ROWS})`);
	}

	const plan = await planImport(userId, parsed.data);
	const issues = [...parsed.issues, ...plan.issues].slice(0, MAX_ISSUES);
	const toImport = plan.sections.reduce((sum, section) => sum + section.toImport, 0);
	const skipped = plan.sections.reduce((sum, section) => sum + section.skipped, 0);

	if (mode === 'preview') {
		return {
			mode,
			format: parsed.format,
			totalRows,
			imported: 0,
			skipped,
			sections: plan.sections,
			samples: plan.samples,
			issues
		};
	}

	const now = new Date();
	const db = getDB();
	await db.transaction(async (tx) => {
		await inChunks(plan.newFoods, (part) =>
			tx
				.insert(foods)
				.values(
					part.map((row) => ({
						...row,
						userId,
						isFavorite: row.isFavorite ?? false,
						novaGroup: row.novaGroup ?? null,
						imageUrl: null,
						createdAt: toDate(row.createdAt, now),
						updatedAt: now
					}))
				)
				.onConflictDoNothing()
		);
		await inChunks(plan.newRecipes, (part) =>
			tx
				.insert(recipes)
				.values(
					part.map((row) => ({
						id: row.id,
						userId,
						name: row.name,
						totalServings: row.totalServings,
						isFavorite: row.isFavorite ?? false,
						imageUrl: null,
						createdAt: toDate(row.createdAt, now),
						updatedAt: now
					}))
				)
				.onConflictDoNothing()
		);
		await inChunks(plan.newRecipeIngredients, (part) =>
			tx
				.insert(recipeIngredients)
				.values(
					part.map((row) => ({
						recipeId: row.recipeId,
						foodId: row.foodId,
						quantity: row.quantity,
						servingUnit: row.servingUnit,
						sortOrder: row.sortOrder
					}))
				)
				.onConflictDoNothing()
		);
		await inChunks(plan.newSupplements, (part) =>
			tx
				.insert(supplements)
				.values(
					part.map((row) => ({
						id: row.id,
						userId,
						name: row.name,
						scheduleType: row.scheduleType,
						scheduleDays: row.scheduleDays ?? null,
						scheduleStartDate: row.scheduleStartDate ?? null,
						isActive: row.isActive ?? true,
						sortOrder: row.sortOrder ?? 0,
						timeOfDay: row.timeOfDay ?? null,
						reminderTimes: row.reminderTimes ?? null,
						createdAt: now,
						updatedAt: now
					}))
				)
				.onConflictDoNothing()
		);
		await inChunks(plan.newSupplementIngredients, (part) =>
			tx
				.insert(supplementIngredients)
				.values(
					part.map((row) => ({
						supplementId: row.supplementId,
						foodId: row.foodId,
						servings: row.servings,
						sortOrder: row.sortOrder
					}))
				)
				.onConflictDoNothing()
		);
		await inChunks(plan.newEntries, (part) =>
			tx
				.insert(foodEntries)
				.values(
					part.map((row) => ({
						id: row.id,
						userId,
						foodId: row.foodId ?? null,
						recipeId: row.recipeId ?? null,
						supplementId: row.supplementId ?? null,
						date: row.date,
						mealType: row.mealType,
						servings: row.servings,
						notes: row.notes ?? null,
						quickName: row.quickName ?? null,
						quickCalories: row.quickCalories ?? null,
						quickProtein: row.quickProtein ?? null,
						quickCarbs: row.quickCarbs ?? null,
						quickFat: row.quickFat ?? null,
						quickFiber: row.quickFiber ?? null,
						quickNutrients: row.quickNutrients ?? null,
						eatenAt: toDate(row.eatenAt, new Date(`${row.date}T12:00:00.000Z`)),
						createdAt: now,
						updatedAt: now
					}))
				)
				.onConflictDoNothing()
		);
		await inChunks(plan.newWeight, (part) =>
			tx
				.insert(weightEntries)
				.values(
					part.map((row) => ({
						userId,
						entryDate: row.entryDate,
						weightKg: row.weightKg,
						loggedAt: toDate(row.loggedAt, new Date(`${row.entryDate}T12:00:00.000Z`)),
						notes: row.notes ?? null,
						createdAt: now,
						updatedAt: now
					}))
				)
				.onConflictDoNothing()
		);
		await inChunks(plan.newSleep, (part) =>
			tx
				.insert(sleepEntries)
				.values(
					part.map((row) => ({
						userId,
						entryDate: row.entryDate,
						durationMinutes: row.durationMinutes,
						quality: row.quality,
						bedtime: row.bedtime ? new Date(row.bedtime) : null,
						wakeTime: row.wakeTime ? new Date(row.wakeTime) : null,
						wakeUps: row.wakeUps ?? null,
						sleepLatencyMinutes: row.sleepLatencyMinutes ?? null,
						deepSleepMinutes: row.deepSleepMinutes ?? null,
						lightSleepMinutes: row.lightSleepMinutes ?? null,
						remSleepMinutes: row.remSleepMinutes ?? null,
						source: row.source ?? 'import',
						notes: row.notes ?? null,
						loggedAt: toDate(row.loggedAt, new Date(`${row.entryDate}T12:00:00.000Z`)),
						createdAt: now,
						updatedAt: now
					}))
				)
				.onConflictDoNothing()
		);
		await inChunks(plan.newDays, (part) =>
			tx
				.insert(dayProperties)
				.values(
					part.map((row) => ({
						userId,
						date: row.date,
						isFastingDay: row.isFastingDay,
						createdAt: now,
						updatedAt: now
					}))
				)
				.onConflictDoNothing()
		);
	});

	return {
		mode,
		format: parsed.format,
		totalRows,
		imported: toImport,
		skipped,
		sections: plan.sections,
		samples: plan.samples,
		issues
	};
}
