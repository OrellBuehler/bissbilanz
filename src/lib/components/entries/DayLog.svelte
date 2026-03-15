<script lang="ts">
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import AddFoodModal from '$lib/components/entries/AddFoodModal.svelte';
	import EditEntryModal from '$lib/components/entries/EditEntryModal.svelte';
	import BarcodeScanModal from '$lib/components/barcode/BarcodeScanModal.svelte';
	import { sumEntries, type MacroTotals } from '$lib/utils/nutrition';
	import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api/client';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		date: string;
		refreshKey?: number;
		dashboardStyle?: boolean;
		onMutation?: () => void;
		onTotalsChange?: (totals: MacroTotals) => void;
		scanModalOpen?: boolean;
		addModalOpen?: boolean;
	};

	let {
		date,
		refreshKey = 0,
		dashboardStyle = false,
		onMutation,
		onTotalsChange,
		scanModalOpen = $bindable(false),
		addModalOpen = $bindable(false)
	}: Props = $props();

	let foods: Array<any> = $state([]);
	let recipes: Array<any> = $state([]);
	let entries: Array<any> = $state([]);
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

	let foodsLoaded = false;

	const loadFoodsAndRecipes = async () => {
		if (foodsLoaded) return;
		const [foodsResult, recipesResult] = await Promise.all([
			api.GET('/api/foods'),
			api.GET('/api/recipes')
		]);
		foods = foodsResult.data?.foods ?? [];
		recipes = recipesResult.data?.recipes ?? [];
		foodsLoaded = true;
	};

	const loadEntries = async () => {
		const { data } = await api.GET('/api/entries', {
			params: { query: { date } }
		});
		entries = data?.entries ?? [];
	};

	const addEntry = async (payload: any) => {
		await api.POST('/api/entries', { body: { ...payload, date } });
		addModalOpen = false;
		await loadEntries();
		onMutation?.();
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
		await api.PATCH('/api/entries/{id}', {
			params: { path: { id } },
			body
		});
		editModalOpen = false;
		editingEntry = null;
		await loadEntries();
		onMutation?.();
	};

	const deleteEntry = async (id: string) => {
		await api.DELETE('/api/entries/{id}', {
			params: { path: { id } }
		});
		editModalOpen = false;
		editingEntry = null;
		await loadEntries();
		onMutation?.();
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
		const { data } = await api.GET('/api/foods', {
			params: { query: { barcode } }
		});
		if (data?.foods?.length) {
			addModalOpen = true;
		} else {
			goto(`/foods?barcode=${encodeURIComponent(barcode)}`);
		}
	};

	const totals = $derived(sumEntries(entries));

	const mealTypes = $derived(() => {
		const custom = entries
			.map((e: { mealType: string }) => e.mealType)
			.filter((mt: string) => !(DEFAULT_MEAL_TYPES as readonly string[]).includes(mt));
		return [...DEFAULT_MEAL_TYPES, ...new Set(custom)];
	});

	$effect(() => {
		onTotalsChange?.(totals);
	});

	loadFoodsAndRecipes();

	$effect(() => {
		if (date) {
			loadEntries();
		}
		refreshKey;
	});
</script>

<div class="space-y-4">
	<div class="grid gap-4">
		{#each mealTypes() as mealType}
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
