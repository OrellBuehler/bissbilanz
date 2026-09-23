<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import RecipeSuggestionRow from '$lib/components/recipe-suggestions/RecipeSuggestionRow.svelte';
	import ServingsPicker from '$lib/components/favorites/ServingsPicker.svelte';
	import FavoriteMealPicker from '$lib/components/favorites/FavoriteMealPicker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import ChefHat from '@lucide/svelte/icons/chef-hat';
	import { DEFAULT_MEAL_TYPES, mergeMealTypes, resolveMealTypeForMinute } from '$lib/utils/meals';
	import { remainingBudget, type MacroTotals } from '$lib/utils/nutrition';
	import {
		suggestRecipes,
		perServingMacros,
		type RecipeSuggestion
	} from '$lib/analytics/recipe-suggestions';
	import { today } from '$lib/utils/dates';
	import { api } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { recipeService } from '$lib/services/recipe-service.svelte';
	import { mealTypeService } from '$lib/services/meal-type-service.svelte';
	import * as m from '$lib/paraglide/messages';

	type DisplaySuggestion = RecipeSuggestion & {
		name: string;
		imageUrl: string | null;
		isFavorite: boolean;
	};

	type Props = {
		totals: MacroTotals;
		goals: {
			calorieGoal: number;
			proteinGoal: number;
			carbGoal: number;
			fatGoal: number;
		} | null;
		onEntryLogged: () => void;
		favoriteMealAssignmentMode?: 'time_based' | 'ask_meal';
		favoriteMealTimeframes?: Array<{
			mealType: string;
			startMinute: number;
			endMinute: number;
		}>;
	};

	let {
		totals,
		goals,
		onEntryLogged,
		favoriteMealAssignmentMode = 'time_based',
		favoriteMealTimeframes = []
	}: Props = $props();

	const recipesQuery = useLiveQuery(() => recipeService.allRecipes(), []);
	const mealTypesQuery = useLiveQuery(() => mealTypeService.mealTypes(), []);

	let pickerOpen = $state(false);
	let pickerItem: DisplaySuggestion | null = $state(null);
	let mealPickerOpen = $state(false);
	let pendingLog: { suggestion: DisplaySuggestion; servings: number } | null = $state(null);

	const candidates = $derived(
		(recipesQuery.value ?? [])
			.filter((r) => r.calories != null && r.totalServings > 0)
			.map((r) => ({
				id: r.id,
				name: r.name,
				imageUrl: r.imageUrl,
				isFavorite: r.isFavorite,
				perServing: perServingMacros({
					totalServings: r.totalServings,
					calories: r.calories ?? 0,
					protein: r.protein ?? 0,
					carbs: r.carbs ?? 0,
					fat: r.fat ?? 0,
					fiber: r.fiber ?? 0
				})
			}))
	);

	const remaining = $derived(goals ? remainingBudget(goals, totals) : null);

	const mealOptions = $derived(
		mergeMealTypes(
			[...DEFAULT_MEAL_TYPES],
			(mealTypesQuery.value ?? []).map((t) => t.name)
		)
	);

	const suggestions = $derived<DisplaySuggestion[]>(
		remaining
			? suggestRecipes(remaining, candidates, 3).map((s) => {
					const meta = candidates.find((c) => c.id === s.id);
					return {
						...s,
						name: meta?.name ?? '',
						imageUrl: meta?.imageUrl ?? null,
						isFavorite: meta?.isFavorite ?? false
					};
				})
			: []
	);

	const getConfiguredMeal = (): string | null => {
		if (favoriteMealAssignmentMode === 'ask_meal') return null;
		const now = new Date();
		const minuteOfDay = now.getHours() * 60 + now.getMinutes();
		return resolveMealTypeForMinute(minuteOfDay, favoriteMealTimeframes) ?? null;
	};

	const logEntry = async (suggestion: DisplaySuggestion, servings: number, mealType: string) => {
		const { data, error } = await api.POST('/api/entries', {
			body: { recipeId: suggestion.id, mealType, servings, date: today() }
		});

		if (error) return;

		toast.info(m.favorites_logged_toast({ name: suggestion.name, meal: mealType }), {
			action: data?.entry
				? {
						label: m.favorites_undo(),
						onClick: async () => {
							await api.DELETE('/api/entries/{id}', {
								params: { path: { id: data.entry.id } }
							});
							onEntryLogged();
						}
					}
				: undefined,
			duration: 5000
		});

		onEntryLogged();
	};

	const continuePendingLog = () => {
		if (!pendingLog) return;
		const resolvedMeal = getConfiguredMeal();
		if (resolvedMeal) {
			void logEntry(pendingLog.suggestion, pendingLog.servings, resolvedMeal);
			pendingLog = null;
			return;
		}

		mealPickerOpen = true;
	};

	const handleTap = (suggestion: DisplaySuggestion) => {
		pendingLog = { suggestion, servings: suggestion.servings };
		pickerItem = suggestion;
		pickerOpen = true;
	};

	const handlePickerConfirm = (servings: number) => {
		if (pendingLog) {
			pendingLog = { ...pendingLog, servings };
		}
		pickerOpen = false;
		pickerItem = null;
		continuePendingLog();
	};

	const handleMealConfirm = (mealType: string) => {
		if (pendingLog) {
			void logEntry(pendingLog.suggestion, pendingLog.servings, mealType);
		}
		mealPickerOpen = false;
		pendingLog = null;
	};

	onMount(() => {
		recipeService.refresh();
		mealTypeService.refresh();
	});
</script>

{#if suggestions.length > 0}
	<DashboardCard title={m.dashboard_recipe_suggestions_title()} Icon={ChefHat} tone="tertiary">
		{#snippet headerRight()}
			<Button variant="ghost" size="sm" href="/recipe-suggestions" class="text-xs">
				{m.recipe_suggestions_see_all()}
			</Button>
		{/snippet}

		<div class="space-y-2">
			{#each suggestions as suggestion (suggestion.id)}
				<RecipeSuggestionRow
					name={suggestion.name}
					imageUrl={suggestion.imageUrl}
					isFavorite={suggestion.isFavorite}
					servings={suggestion.servings}
					macros={suggestion.macros}
					fit={suggestion.fit}
					compact
					onTap={() => handleTap(suggestion)}
				/>
			{/each}
		</div>
	</DashboardCard>
{/if}

<ServingsPicker
	bind:open={pickerOpen}
	itemName={pickerItem?.name ?? ''}
	initialServings={pickerItem?.servings ?? 1}
	onConfirm={handlePickerConfirm}
	onClose={() => {
		pickerOpen = false;
		pickerItem = null;
		pendingLog = null;
	}}
/>

<FavoriteMealPicker
	bind:open={mealPickerOpen}
	itemName={pendingLog?.suggestion.name ?? ''}
	imageUrl={pendingLog?.suggestion.imageUrl}
	{mealOptions}
	onConfirm={handleMealConfirm}
	onClose={() => {
		mealPickerOpen = false;
		pendingLog = null;
	}}
/>
