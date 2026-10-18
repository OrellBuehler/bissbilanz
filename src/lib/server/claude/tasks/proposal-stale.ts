import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import { validateMealType } from '../../entries';
import { aiTasks, claudeTaskRuns, foods, recipes } from '../../schema';
import { wakeClaudeRun } from './executor';
import type { Proposal, ProposalItem } from './types';

type ItemEntry = { foodId?: string | null; recipeId?: string | null; mealType?: string };

const entryOf = (item: ProposalItem) => item.entry as ItemEntry;

async function findStaleItemIds(
	tx: Parameters<Parameters<ReturnType<typeof getDB>['transaction']>[0]>[0],
	userId: string,
	items: ProposalItem[]
): Promise<Set<string>> {
	const foodIds = [
		...new Set(
			items
				.filter((i) => !i.food)
				.map((i) => entryOf(i).foodId)
				.filter(Boolean)
		)
	] as string[];
	const recipeIds = [...new Set(items.map((i) => entryOf(i).recipeId).filter(Boolean))] as string[];
	const [foodRows, recipeRows] = await Promise.all([
		foodIds.length
			? tx
					.select({ id: foods.id })
					.from(foods)
					.where(and(eq(foods.userId, userId), inArray(foods.id, foodIds)))
			: [],
		recipeIds.length
			? tx
					.select({ id: recipes.id })
					.from(recipes)
					.where(and(eq(recipes.userId, userId), inArray(recipes.id, recipeIds)))
			: []
	]);
	const liveFoods = new Set(foodRows.map((row) => row.id));
	const liveRecipes = new Set(recipeRows.map((row) => row.id));
	const mealTypeOk = new Map<string, boolean>();
	const stale = new Set<string>();
	for (const item of items) {
		const { foodId, recipeId, mealType } = entryOf(item);
		let ok =
			(!foodId || item.food != null || liveFoods.has(foodId)) &&
			(!recipeId || liveRecipes.has(recipeId));
		if (ok && mealType) {
			if (!mealTypeOk.has(mealType)) {
				mealTypeOk.set(mealType, await validateMealType(userId, mealType, tx));
			}
			ok = mealTypeOk.get(mealType) === true;
		}
		if (!ok) stale.add(item.id);
	}
	return stale;
}

export async function dropStaleProposalItems(
	userId: string,
	taskId: string,
	seenAttempt: number,
	failingItemId: string
): Promise<void> {
	const requeued = await getDB().transaction(async (tx) => {
		const [task] = await tx
			.select({ status: aiTasks.status })
			.from(aiTasks)
			.where(and(eq(aiTasks.id, taskId), eq(aiTasks.userId, userId)))
			.for('update');
		const [run] = await tx
			.select()
			.from(claudeTaskRuns)
			.where(and(eq(claudeTaskRuns.taskId, taskId), eq(claudeTaskRuns.userId, userId)))
			.for('update');
		if (task?.status !== 'pending' || run?.state !== 'proposed' || run.attempt !== seenAttempt) {
			return false;
		}
		const proposal = (run.proposal as Proposal | null) ?? { summary: null, items: [] };
		const stale = await findStaleItemIds(tx, userId, proposal.items);
		stale.add(failingItemId);
		const items = proposal.items.filter((item) => !stale.has(item.id));
		if (items.length > 0) {
			await tx
				.update(claudeTaskRuns)
				.set({ proposal: { ...proposal, items }, updatedAt: sql`now()` })
				.where(eq(claudeTaskRuns.taskId, taskId));
			return false;
		}
		await tx
			.update(claudeTaskRuns)
			.set({ state: 'queued', proposal: null, nextAttemptAt: null, updatedAt: sql`now()` })
			.where(eq(claudeTaskRuns.taskId, taskId));
		return true;
	});
	if (requeued) wakeClaudeRun(taskId, userId);
}
