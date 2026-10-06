import { getTableName, sql } from 'drizzle-orm';
import { recipeLabels, recipes, type LabelSource } from '$lib/server/schema';
import {
	getSubjectLabels,
	recipeSubject,
	setSubjectLabels,
	setSubjectLabelsBatch,
	type SetFoodLabelsOptions
} from '$lib/server/food-labels';

// Written out rather than interpolating `recipes.id`: see foodLabelsExpr.
const recipesId = sql`${sql.identifier(getTableName(recipes))}.${sql.identifier('id')}`;

/** Flat, sorted label array carried on every recipe read, like `foods.labels`. */
export const recipeLabelsExpr = sql<string[]>`COALESCE((
	SELECT array_agg(rl.label ORDER BY rl.label)
	FROM ${recipeLabels} rl
	WHERE rl.recipe_id = ${recipesId}
), '{}')`;

export const getRecipeLabels = (userId: string, recipeId: string) =>
	getSubjectLabels(recipeSubject, userId, recipeId);

export const setRecipeLabels = (
	userId: string,
	recipeId: string,
	labels: string[],
	source: LabelSource,
	options: SetFoodLabelsOptions = {}
) => setSubjectLabels(recipeSubject, userId, recipeId, labels, source, options);

export type RecipeBatchLabelItem = { recipeId: string; labels: string[] };
export type RecipeBatchLabelResult = {
	recipeId: string;
	ok: boolean;
	labels?: string[];
	dropped?: string[];
	error?: string;
};

export async function setRecipeLabelsBatch(
	userId: string,
	items: RecipeBatchLabelItem[],
	source: LabelSource,
	options: Omit<SetFoodLabelsOptions, 'clientEditedAt'> = {}
): Promise<RecipeBatchLabelResult[]> {
	const results = await setSubjectLabelsBatch(
		recipeSubject,
		userId,
		items.map((item) => ({ id: item.recipeId, labels: item.labels })),
		source,
		options,
		'Recipe not found'
	);
	return results.map(({ id, ...rest }) => ({ recipeId: id, ...rest }));
}
