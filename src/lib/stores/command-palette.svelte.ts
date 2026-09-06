export type QuickAction =
	| { type: 'add-food'; foodId?: string; recipeId?: string }
	| { type: 'scan' }
	| { type: 'new-food' }
	| { type: 'new-recipe' };

let paletteOpen = $state(false);
let pending = $state<QuickAction | null>(null);

export const commandPalette = {
	get open() {
		return paletteOpen;
	},
	set open(value: boolean) {
		paletteOpen = value;
	},
	toggle() {
		paletteOpen = !paletteOpen;
	}
};

/**
 * Hand an action to the page that owns the matching dialog (the day log owns
 * the add-food and scan modals, /foods and /recipes own their forms). The
 * palette navigates there and the page picks the request up.
 */
export const requestQuickAction = (action: QuickAction) => {
	pending = action;
};

/**
 * Take the pending action if it is one of `types`, clearing it so a later
 * navigation does not reopen the same dialog.
 */
export const consumeQuickAction = <T extends QuickAction['type']>(
	types: readonly T[]
): Extract<QuickAction, { type: T }> | null => {
	const action = pending;
	if (!action || !types.includes(action.type as T)) return null;
	pending = null;
	return action as Extract<QuickAction, { type: T }>;
};
