export const MAX_RECIPE_STEPS = 50;
export const MAX_RECIPE_STEP_TEXT = 2000;

export type StepDraft = { key: string; text: string; imageUrl: string | null };

export type StepPayload = { text: string; imageUrl: string | null };

export const newStepDraft = (): StepDraft => ({
	key: crypto.randomUUID(),
	text: '',
	imageUrl: null
});

export const toStepDrafts = (
	steps: ReadonlyArray<{ text: string; imageUrl?: string | null }> | null | undefined
): StepDraft[] =>
	(steps ?? []).map((step) => ({
		key: crypto.randomUUID(),
		text: step.text,
		imageUrl: step.imageUrl ?? null
	}));

/** Move a step one place up (-1) or down (1); out-of-range moves are a no-op. */
export const moveStep = <T>(steps: T[], index: number, direction: -1 | 1): T[] => {
	const target = index + direction;
	if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) return steps;
	const next = [...steps];
	[next[index], next[target]] = [next[target], next[index]];
	return next;
};

/** Trim text and drop steps left blank, in order, capped at the API limit. */
export const buildStepsPayload = (steps: ReadonlyArray<StepDraft>): StepPayload[] =>
	steps
		.map((step) => ({
			text: step.text.trim().slice(0, MAX_RECIPE_STEP_TEXT),
			imageUrl: step.imageUrl
		}))
		.filter((step) => step.text.length > 0)
		.slice(0, MAX_RECIPE_STEPS);

const UNIT_SHORT: Record<string, string> = {
	fl_oz: 'fl oz'
};

/** Compact ingredient amount for the cooking checklist, e.g. "250 g" or "1.5 tbsp". */
export const formatIngredientAmount = (quantity: number, unit: string): string => {
	const rounded = Math.round(quantity * 100) / 100;
	return `${rounded} ${UNIT_SHORT[unit] ?? unit}`;
};
