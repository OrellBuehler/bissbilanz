<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import RecipeSuggestionRow from '$lib/components/recipe-suggestions/RecipeSuggestionRow.svelte';
	import ServingsPicker from '$lib/components/favorites/ServingsPicker.svelte';
	import FavoriteMealPicker from '$lib/components/favorites/FavoriteMealPicker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		MACRO_TEXT_CLASS,
		MACRO_LABEL_CLASS,
		MACRO_CARD_BG_CLASS,
		type MacroKey
	} from '$lib/utils/colors';
	import { formatKcal, formatGrams } from '$lib/utils/number';
	import Target from '@lucide/svelte/icons/target';
	import CookingPot from '@lucide/svelte/icons/cooking-pot';
	import PartyPopper from '@lucide/svelte/icons/party-popper';
	import { DEFAULT_MEAL_TYPES, mergeMealTypes, resolveMealTypeForMinute } from '$lib/utils/meals';
	import { sumEntries, remainingBudget } from '$lib/utils/nutrition';
	import {
		suggestRecipes,
		perServingMacros,
		MIN_REMAINING_CALORIES,
		type RecipeSuggestion
	} from '$lib/analytics/recipe-suggestions';
	import { today } from '$lib/utils/dates';
	import { api } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import { browser } from '$app/environment';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { recipeService } from '$lib/services/recipe-service.svelte';
	import { goalsService } from '$lib/services/goals-service.svelte';
	import { entryService } from '$lib/services/entry-service.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import { mealTypeService } from '$lib/services/meal-type-service.svelte';
	import { dayPropertiesService } from '$lib/services/day-properties-service.svelte';
	import { adjustGoalsForActivity } from '$lib/utils/activity-goals';
	import * as m from '$lib/paraglide/messages';

	type DisplaySuggestion = RecipeSuggestion & {
		name: string;
		imageUrl: string | null;
		isFavorite: boolean;
	};

	const dateToday = today();

	const recipesQuery = useLiveQuery(() => recipeService.allRecipes(), []);
	const goalsQuery = useLiveQuery(() => goalsService.goals(), undefined);
	const entriesQuery = useLiveQuery(() => entryService.entriesByDate(dateToday), []);
	const prefsQuery = useLiveQuery(() => preferencesService.preferences(), undefined);
	const mealTypesQuery = useLiveQuery(() => mealTypeService.mealTypes(), []);
	const dayPropsQuery = useLiveQuery(() => dayPropertiesService.watch(dateToday), undefined);

	let pickerOpen = $state(false);
	let pickerItem: DisplaySuggestion | null = $state(null);
	let mealPickerOpen = $state(false);
	let pendingLog: { suggestion: DisplaySuggestion; servings: number } | null = $state(null);
	let prefsLoaded = $state(false);

	const recipes = $derived(recipesQuery.value ?? []);
	const totals = $derived(sumEntries(entriesQuery.value ?? []));
	const prefs = $derived(prefsQuery.value ?? null);
	const goals = $derived(
		adjustGoalsForActivity(goalsQuery.value ?? null, dayPropsQuery.value?.activityCalories, {
			enabled: prefs?.activityGoalAdjustment ?? false,
			creditPercent: prefs?.activityCreditPercent ?? 100
		})
	);
	const mealOptions = $derived(
		mergeMealTypes(
			[...DEFAULT_MEAL_TYPES],
			(mealTypesQuery.value ?? []).map((t) => t.name)
		)
	);

	const loading = $derived(
		recipesQuery.loading || goalsQuery.loading || entriesQuery.loading || !prefsLoaded
	);

	const remaining = $derived(goals ? remainingBudget(goals, totals) : null);
	const goalReached = $derived(remaining != null && remaining.calories < MIN_REMAINING_CALORIES);

	const candidates = $derived(
		recipes
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

	const suggestions = $derived<DisplaySuggestion[]>(
		remaining
			? suggestRecipes(remaining, candidates).map((s) => {
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

	const remainingRows: { key: MacroKey; label: string; value: string; size: string }[] = $derived(
		remaining
			? [
					{
						key: 'calories',
						label: m.macro_calories(),
						value: formatKcal(Math.max(0, remaining.calories)),
						size: 'text-lg'
					},
					{
						key: 'protein',
						label: m.macro_protein(),
						value: `${formatGrams(Math.max(0, remaining.protein))}g`,
						size: 'text-base'
					},
					{
						key: 'carbs',
						label: m.macro_carbs(),
						value: `${formatGrams(Math.max(0, remaining.carbs))}g`,
						size: 'text-base'
					},
					{
						key: 'fat',
						label: m.macro_fat(),
						value: `${formatGrams(Math.max(0, remaining.fat))}g`,
						size: 'text-base'
					}
				]
			: []
	);

	$effect(() => {
		if (browser) {
			recipeService.refresh();
			goalsService.refresh();
			entryService.refresh(dateToday);
			mealTypeService.refresh();
			dayPropertiesService.refresh(dateToday);
			loadPreferences();
		}
	});

	const loadPreferences = async () => {
		await preferencesService.refresh();
		prefsLoaded = true;
	};

	const getConfiguredMeal = (): string | null => {
		if ((prefs?.favoriteMealAssignmentMode ?? 'time_based') === 'ask_meal') return null;
		const now = new Date();
		const minuteOfDay = now.getHours() * 60 + now.getMinutes();
		return resolveMealTypeForMinute(minuteOfDay, prefs?.favoriteMealTimeframes ?? []) ?? null;
	};

	const logEntry = async (suggestion: DisplaySuggestion, servings: number, mealType: string) => {
		const { data, error } = await api.POST('/api/entries', {
			body: { recipeId: suggestion.id, mealType, servings, date: dateToday }
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
							entryService.refresh(dateToday);
						}
					}
				: undefined,
			duration: 5000
		});

		entryService.refresh(dateToday);
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
</script>

<div class="mx-auto max-w-2xl space-y-4">
	{#if loading}
		<p class="text-muted-foreground">{m.favorites_loading()}</p>
	{:else if !goals}
		<div class="flex flex-col items-center gap-4 py-12 text-center">
			<Target class="size-16 text-muted-foreground/40" />
			<p class="text-muted-foreground">{m.recipe_suggestions_no_goals_desc()}</p>
			<Button variant="outline" href="/goals">{m.recipe_suggestions_set_goals()}</Button>
		</div>
	{:else}
		<DashboardCard
			title={m.recipe_suggestions_remaining_title()}
			Icon={Target}
			tone="primary"
			class="@container"
		>
			<div class="grid grid-cols-2 gap-2 text-sm @lg:grid-cols-4">
				{#each remainingRows as row (row.key)}
					<div class="rounded-2xl px-3 py-2.5 {MACRO_CARD_BG_CLASS[row.key]}">
						<div class="text-[11px] font-medium {MACRO_LABEL_CLASS[row.key]}">
							{row.label}
						</div>
						<div class="mt-1 {row.size} font-bold tabular-nums {MACRO_TEXT_CLASS[row.key]}">
							{row.value}
						</div>
					</div>
				{/each}
			</div>
		</DashboardCard>

		{#if recipes.length === 0}
			<div class="flex flex-col items-center gap-4 py-12 text-center">
				<CookingPot class="size-16 text-muted-foreground/40" />
				<p class="text-muted-foreground">{m.recipe_suggestions_no_recipes_desc()}</p>
				<Button variant="outline" href="/recipes">{m.favorites_browse_recipes()}</Button>
			</div>
		{:else if goalReached}
			<div class="flex flex-col items-center gap-4 py-12 text-center">
				<PartyPopper class="size-16 text-muted-foreground/40" />
				<p class="font-medium">{m.recipe_suggestions_goal_reached_title()}</p>
				<p class="text-muted-foreground">{m.recipe_suggestions_goal_reached_desc()}</p>
			</div>
		{:else if suggestions.length === 0}
			<div class="flex flex-col items-center gap-4 py-12 text-center">
				<CookingPot class="size-16 text-muted-foreground/40" />
				<p class="text-muted-foreground">{m.recipe_suggestions_no_fit_desc()}</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each suggestions as suggestion (suggestion.id)}
					<RecipeSuggestionRow
						name={suggestion.name}
						imageUrl={suggestion.imageUrl}
						isFavorite={suggestion.isFavorite}
						servings={suggestion.servings}
						macros={suggestion.macros}
						fit={suggestion.fit}
						onTap={() => handleTap(suggestion)}
					/>
				{/each}
			</div>
		{/if}
	{/if}
</div>

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
