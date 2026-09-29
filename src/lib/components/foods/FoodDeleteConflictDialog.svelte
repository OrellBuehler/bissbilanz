<script module lang="ts">
	export type FoodDeleteConflict = {
		id: string;
		name: string;
		entryCount: number;
		recipeCount: number;
		supplementCount: number;
		lastRecipes: { id: string; name: string }[];
	};
</script>

<script lang="ts">
	import ForceDeleteDialog from '$lib/components/ui/force-delete-dialog.svelte';
	import WhereUsedDialog from '$lib/components/usage/WhereUsedDialog.svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		conflict: FoodDeleteConflict | null;
		onConfirm: () => void;
		onCancel: () => void;
	};

	let { conflict, onConfirm, onCancel }: Props = $props();

	// Keep the last conflict so the text does not blank out while the dialog closes.
	let shown = $state<FoodDeleteConflict | null>(null);
	$effect.pre(() => {
		if (conflict) shown = conflict;
	});

	let usageOpen = $state(false);
	let usageFood = $state<{ id: string; name: string } | null>(null);

	// Force cannot delete a food that is a recipe's only ingredient or that
	// supplements still use; say why instead of offering a button that does nothing.
	const forceUnavailable = $derived(
		(shown?.lastRecipes.length ?? 0) > 0 || (shown?.supplementCount ?? 0) > 0
	);

	const description = () => {
		const entryCount = shown?.entryCount ?? 0;
		const recipeCount = shown?.recipeCount ?? 0;
		const supplementCount = shown?.supplementCount ?? 0;
		if (forceUnavailable) {
			return m.foods_delete_blocked_summary({ entryCount, recipeCount, supplementCount });
		}
		if (entryCount > 0 && recipeCount > 0) {
			return m.foods_delete_has_entries_and_recipes({ entryCount, recipeCount });
		}
		if (recipeCount > 0) {
			return m.foods_delete_has_recipes({ count: recipeCount });
		}
		return m.foods_delete_has_entries({ count: entryCount });
	};

	const note = () => {
		if (shown && shown.lastRecipes.length > 0) {
			return m.foods_delete_last_ingredient({
				recipes: shown.lastRecipes.map((recipe) => `"${recipe.name}"`).join(', ')
			});
		}
		if (shown && shown.supplementCount > 0) {
			return m.foods_delete_has_supplements({ count: shown.supplementCount });
		}
		return undefined;
	};

	const showUsage = () => {
		if (!conflict) return;
		usageFood = { id: conflict.id, name: conflict.name };
		usageOpen = true;
	};
</script>

<ForceDeleteDialog
	open={conflict !== null}
	count={(shown?.entryCount ?? 0) + (shown?.recipeCount ?? 0)}
	description={description()}
	note={note()}
	forceDisabled={forceUnavailable}
	usageLabel={m.usage_where_used()}
	onShowUsage={showUsage}
	{onConfirm}
	{onCancel}
/>

<WhereUsedDialog
	bind:open={usageOpen}
	kind="food"
	id={usageFood?.id ?? null}
	name={usageFood?.name ?? ''}
/>
