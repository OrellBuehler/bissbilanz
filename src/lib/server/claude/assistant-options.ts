import { eq } from 'drizzle-orm';
import { getDB } from '../db';
import { userPreferences } from '../schema';

/** What a user lets the server-side assistant do; each option shapes its system prompt or tool list. */
export type AssistantOptions = {
	researchNutrients: boolean;
	webResearch: boolean;
	realServings: boolean;
	createFoods: boolean;
};

export const DEFAULT_ASSISTANT_OPTIONS: AssistantOptions = {
	researchNutrients: true,
	webResearch: true,
	realServings: true,
	createFoods: true
};

export const assistantOptionColumns = {
	researchNutrients: userPreferences.aiResearchNutrients,
	webResearch: userPreferences.aiWebResearch,
	realServings: userPreferences.aiRealServings,
	createFoods: userPreferences.aiTaskCreateFoods
};

/** A user without a preferences row has every option at its default. */
export const resolveAssistantOptions = (
	row: Partial<AssistantOptions> | null | undefined
): AssistantOptions => ({
	researchNutrients: row?.researchNutrients ?? DEFAULT_ASSISTANT_OPTIONS.researchNutrients,
	webResearch: row?.webResearch ?? DEFAULT_ASSISTANT_OPTIONS.webResearch,
	realServings: row?.realServings ?? DEFAULT_ASSISTANT_OPTIONS.realServings,
	createFoods: row?.createFoods ?? DEFAULT_ASSISTANT_OPTIONS.createFoods
});

export async function loadAssistantOptions(userId: string): Promise<AssistantOptions> {
	const [row] = await getDB()
		.select(assistantOptionColumns)
		.from(userPreferences)
		.where(eq(userPreferences.userId, userId));
	return resolveAssistantOptions(row);
}
