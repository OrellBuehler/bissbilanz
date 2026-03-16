<script lang="ts">
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import AddFoodModal from '$lib/components/entries/AddFoodModal.svelte';
	import EditEntryModal from '$lib/components/entries/EditEntryModal.svelte';
	import BarcodeScanModal from '$lib/components/barcode/BarcodeScanModal.svelte';
	import { sumEntries, type MacroTotals } from '$lib/utils/nutrition';
	import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
	import { goto } from '$app/navigation';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { entryService } from '$lib/services/entry-service.svelte';
	import { foodService } from '$lib/services/food-service.svelte';
	import { recipeService } from '$lib/services/recipe-service.svelte';
	import { dayPropertiesService } from '$lib/services/day-properties-service.svelte';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		date: string;
		dashboardStyle?: boolean;
		onTotalsChange?: (totals: MacroTotals) => void;
		scanModalOpen?: boolean;
		addModalOpen?: boolean;
	};

	let {
		date,
		dashboardStyle = false,
		onTotalsChange,
		scanModalOpen = $bindable(false),
		addModalOpen = $bindable(false)
	}: Props = $props();

	const entriesQuery = useLiveQuery(() => entryService.entriesByDate(date), []);
	const foodsQuery = useLiveQuery(() => foodService.allFoods(), []);
	const recipesQuery = useLiveQuery(() => recipeService.allRecipes(), []);

	let entries = $derived(entriesQuery.value);
	let foods = $derived(foodsQuery.value);
	let recipes = $derived(recipesQuery.value);

	let editModalOpen = $state(false);
	let activeMeal = $state('Breakfast');
	let editingEntry: {
		id: string;
		servings: number;
		mealType: string;
		foodName?: string;
		servingSize?: number | null;
		servingUnit?: string | null;
		calories?: number | null;
		eatenAt?: string | null;
		quickCalories?: number | null;
		quickProtein?: number | null;
		quickCarbs?: number | null;
		quickFat?: number | null;
		quickFiber?: number | null;
		quickName?: string | null;
	} | null = $state(null);

	let isFastingDay = $state(false);
	let fastingLoading = $state(false);

	// Fire background refreshes
	$effect(() => {
		entryService.refresh(date);
		loadFastingDay(date);
	});
	$effect(() => {
		foodService.refresh();
		recipeService.refresh();
	});

	async function loadFastingDay(d: string) {
		const cached = await dayPropertiesService.get(d);
		if (d !== date) return;
		isFastingDay = cached?.isFastingDay ?? false;
		const refreshed = await dayPropertiesService.refresh(d);
		if (d !== date) return;
		isFastingDay = refreshed?.isFastingDay ?? false;
	}

	async function toggleFastingDay() {
		fastingLoading = true;
		const newValue = !isFastingDay;
		isFastingDay = newValue;
		const success = await dayPropertiesService.setFastingDay(date, newValue);
		if (!success) isFastingDay = !newValue;
		fastingLoading = false;
	}

	const addEntry = async (payload: any) => {
		await entryService.create({ ...payload, date });
		addModalOpen = false;
	};

	const updateEntry = async (payload: {
		id: string;
		servings: number;
		mealType: string;
		eatenAt?: string | null;
		quickName?: string | null;
		quickCalories?: number | null;
		quickProtein?: number | null;
		quickCarbs?: number | null;
		quickFat?: number | null;
		quickFiber?: number | null;
	}) => {
		const { id, ...body } = payload;
		await entryService.update(id, body);
		editModalOpen = false;
		editingEntry = null;
	};

	const deleteEntry = async (id: string) => {
		await entryService.delete(id);
		editModalOpen = false;
		editingEntry = null;
	};

	const openEditModal = (entry: {
		id: string;
		servings: number;
		mealType: string;
		foodName?: string;
		servingSize?: number | null;
		servingUnit?: string | null;
		calories?: number | null;
		eatenAt?: string | null;
		quickCalories?: number | null;
		quickProtein?: number | null;
		quickCarbs?: number | null;
		quickFat?: number | null;
		quickFiber?: number | null;
		quickName?: string | null;
	}) => {
		editingEntry = entry;
		editModalOpen = true;
	};

	const handleBarcodeScan = async (barcode: string) => {
		const food = await foodService.findByBarcode(barcode);
		if (food) {
			addModalOpen = true;
		} else {
			goto(`/foods?barcode=${encodeURIComponent(barcode)}`);
		}
	};

	const totals = $derived(sumEntries(entries));

	const mealTypes = $derived.by(() => {
		const custom = entries
			.map((e: { mealType: string }) => e.mealType)
			.filter((mt: string) => !(DEFAULT_MEAL_TYPES as readonly string[]).includes(mt));
		return [...DEFAULT_MEAL_TYPES, ...new Set(custom)];
	});

	$effect(() => {
		onTotalsChange?.(totals);
	});
</script>

<div class="space-y-4">
	<div class="grid gap-4">
		{#each mealTypes as mealType}
			<MealSection
				title={mealType}
				{dashboardStyle}
				entries={entries.filter((e) => e.mealType === mealType)}
				onAdd={() => {
					addModalOpen = true;
					activeMeal = mealType;
				}}
				onEdit={openEditModal}
				onDelete={deleteEntry}
			/>
		{/each}
	</div>

	<div
		class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5"
	>
		<div class="flex items-center gap-2">
			<UtensilsCrossed class="size-4 text-muted-foreground" />
			<div>
				<span class="text-sm font-medium">{m.fasting_day()}</span>
				<p class="text-xs text-muted-foreground">{m.fasting_day_description()}</p>
			</div>
		</div>
		<Switch checked={isFastingDay} onCheckedChange={toggleFastingDay} disabled={fastingLoading} />
	</div>

	<AddFoodModal
		bind:open={addModalOpen}
		{foods}
		{recipes}
		{date}
		mealType={activeMeal}
		onClose={() => {
			addModalOpen = false;
		}}
		onSave={addEntry}
	/>
	<EditEntryModal
		bind:open={editModalOpen}
		{date}
		entry={editingEntry}
		onClose={() => {
			editModalOpen = false;
			editingEntry = null;
		}}
		onSave={updateEntry}
		onDelete={deleteEntry}
	/>
	<BarcodeScanModal
		bind:open={scanModalOpen}
		onClose={() => (scanModalOpen = false)}
		onBarcode={handleBarcodeScan}
	/>
</div>
