<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import AmountInput from '$lib/components/entries/AmountInput.svelte';
	import FoodPicker, {
		type PickerFoodItem,
		type PickerRecipeItem,
		type PickerSelection
	} from '$lib/components/entries/FoodPicker.svelte';
	import QuickFoodEntry, {
		type QuickLogPayload
	} from '$lib/components/entries/QuickFoodEntry.svelte';
	import Check from '@lucide/svelte/icons/check';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { Label } from '$lib/components/ui/label/index.js';
	import { timeToIsoString, currentTime24h } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';
	import { foodService } from '$lib/services/food-service.svelte';

	type Props = {
		open?: boolean;
		foods?: PickerFoodItem[];
		recipes?: PickerRecipeItem[];
		mealType?: string;
		date: string;
		initialFoodId?: string | null;
		onClose: () => void;
		onSave: (payload: {
			foodId?: string;
			recipeId?: string;
			mealType: string;
			servings: number;
			eatenAt?: string;
			quickName?: string;
			quickCalories?: number;
			quickProtein?: number;
			quickCarbs?: number;
			quickFat?: number;
			quickFiber?: number;
		}) => void;
	};

	let {
		open = $bindable(false),
		foods = [],
		recipes = [],
		mealType = 'Breakfast',
		date,
		initialFoodId,
		onClose,
		onSave
	}: Props = $props();

	let servings = $state(1);
	let eatenTime = $state(currentTime24h());
	let tab: 'search' | 'favorites' | 'recent' | 'recipes' | 'quick' = $state('search');

	let selectedFood: {
		id: string;
		name: string;
		type: 'food' | 'recipe';
		servingSize?: number | null;
		servingUnit?: string | null;
		calories?: number | null;
	} | null = $state(null);

	let wasOpen = $state(false);
	$effect(() => {
		if (wasOpen && !open) {
			onClose();
		}
		if (!wasOpen && open) {
			eatenTime = currentTime24h();
			if (initialFoodId) {
				const food = foods.find((f) => f.id === initialFoodId);
				if (food) handleSelect({ type: 'food', food });
			}
		}
		wasOpen = open;
	});

	const handleSelect = async (selection: PickerSelection) => {
		if (selection.type === 'food') {
			selectedFood = {
				id: selection.food.id,
				name: selection.food.name,
				type: 'food',
				servingSize: selection.food.servingSize,
				servingUnit: selection.food.servingUnit,
				calories: selection.food.calories
			};
		} else if (selection.type === 'recipe') {
			selectedFood = { id: selection.recipe.id, name: selection.recipe.name, type: 'recipe' };
		} else if (selection.type === 'catalog') {
			const food = await foodService.saveFromCatalog(selection.catalog.id);
			if (!food) {
				alert(m.add_food_catalog_add_failed());
				return;
			}
			selectedFood = {
				id: food.id,
				name: food.name,
				type: 'food',
				servingSize: food.servingSize,
				servingUnit: food.servingUnit,
				calories: food.calories
			};
		} else if (selection.type === 'favorite') {
			selectedFood = {
				id: selection.favorite.id,
				name: selection.favorite.name,
				type: selection.favorite.type,
				servingSize: selection.favorite.servingSize,
				servingUnit: selection.favorite.servingUnit,
				calories: selection.favorite.calories
			};
		}
		servings = 1;
	};

	const confirmAdd = () => {
		if (!selectedFood) return;
		const eatenAt = timeToIsoString(eatenTime, date) ?? undefined;
		const base = { mealType, servings, eatenAt };
		if (selectedFood.type === 'food') {
			onSave({ foodId: selectedFood.id, ...base });
		} else {
			onSave({ recipeId: selectedFood.id, ...base });
		}
		selectedFood = null;
	};

	const confirmQuickLog = (payload: QuickLogPayload) => {
		onSave({
			mealType,
			servings: 1,
			eatenAt: timeToIsoString(eatenTime, date) ?? undefined,
			...payload
		});
	};

	const goBack = () => {
		selectedFood = null;
	};
</script>

<ResponsiveModal bind:open title={m.add_food_title()} openFull>
	<div class="min-w-0 space-y-4">
		{#if selectedFood}
			<div class="space-y-4">
				<div class="flex min-w-0 items-center gap-2">
					<Button variant="ghost" size="icon" onclick={goBack} class="shrink-0 size-8">
						<ArrowLeft class="size-4" />
					</Button>
					<span class="min-w-0 truncate text-sm font-medium">{selectedFood.name}</span>
				</div>

				<AmountInput
					{servings}
					servingSize={selectedFood.servingSize}
					servingUnit={selectedFood.servingUnit}
					caloriesPerServing={selectedFood.calories}
					onServingsChange={(v) => (servings = v)}
				/>

				<div class="grid gap-1.5">
					<Label class="text-xs">{m.add_food_time()}</Label>
					<Input type="time" bind:value={eatenTime} />
				</div>

				<Button class="w-full" onclick={confirmAdd}>
					<Check class="mr-1 size-4" />
					{m.add_food_add()}
				</Button>
			</div>
		{:else}
			<Tabs.Root value={tab} onValueChange={(v) => (tab = v as typeof tab)}>
				<Tabs.List class="grid h-auto w-full grid-cols-3 gap-1 sm:h-9 sm:grid-cols-5">
					<Tabs.Trigger value="search" class="text-xs sm:text-sm"
						>{m.add_food_tab_search()}</Tabs.Trigger
					>
					<Tabs.Trigger value="favorites" class="text-xs sm:text-sm"
						>{m.add_food_tab_favorites()}</Tabs.Trigger
					>
					<Tabs.Trigger value="recent" class="text-xs sm:text-sm"
						>{m.add_food_tab_recent()}</Tabs.Trigger
					>
					<Tabs.Trigger value="recipes" class="text-xs sm:text-sm"
						>{m.add_food_tab_recipes()}</Tabs.Trigger
					>
					<Tabs.Trigger value="quick" class="text-xs sm:text-sm"
						>{m.add_food_tab_quick()}</Tabs.Trigger
					>
				</Tabs.List>

				<FoodPicker
					{foods}
					{recipes}
					tab={tab === 'quick' ? 'search' : tab}
					onSelect={handleSelect}
				/>

				<Tabs.Content value="quick" class="space-y-4">
					<QuickFoodEntry
						{eatenTime}
						onEatenTimeChange={(v) => (eatenTime = v)}
						onSubmit={confirmQuickLog}
					/>
				</Tabs.Content>
			</Tabs.Root>
		{/if}
	</div>
</ResponsiveModal>
