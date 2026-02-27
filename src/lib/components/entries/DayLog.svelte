<script lang="ts">
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import AddFoodModal from '$lib/components/entries/AddFoodModal.svelte';
	import EditEntryModal from '$lib/components/entries/EditEntryModal.svelte';
	import BarcodeScanModal from '$lib/components/barcode/BarcodeScanModal.svelte';
	import { sumEntries, type MacroTotals } from '$lib/utils/nutrition';
	import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/utils/api';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		date: string;
		refreshKey?: number;
		dashboardStyle?: boolean;
		onMutation?: () => void;
		onTotalsChange?: (totals: MacroTotals) => void;
		scanModalOpen?: boolean;
	};

	let {
		date,
		refreshKey = 0,
		dashboardStyle = false,
		onMutation,
		onTotalsChange,
		scanModalOpen = $bindable(false)
	}: Props = $props();

	let foods: Array<any> = $state([]);
	let recipes: Array<any> = $state([]);
	let entries: Array<any> = $state([]);
	let addModalOpen = $state(false);
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
	} | null = $state(null);

	let foodsLoaded = false;

	const loadFoodsAndRecipes = async () => {
		if (foodsLoaded) return;
		const [foodsRes, recipesRes] = await Promise.all([fetch('/api/foods'), fetch('/api/recipes')]);
		foods = (await foodsRes.json()).foods ?? [];
		recipes = (await recipesRes.json()).recipes ?? [];
		foodsLoaded = true;
	};

	const loadEntries = async () => {
		const res = await fetch(`/api/entries?date=${date}`);
		entries = (await res.json()).entries ?? [];
	};

	const addEntry = async (payload: any) => {
		await apiFetch('/api/entries', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...payload, date })
		});
		addModalOpen = false;
		await loadEntries();
		onMutation?.();
	};

	const updateEntry = async (payload: { id: string; servings: number; mealType: string }) => {
		await apiFetch(`/api/entries/${payload.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ servings: payload.servings, mealType: payload.mealType })
		});
		editModalOpen = false;
		editingEntry = null;
		await loadEntries();
		onMutation?.();
	};

	const deleteEntry = async (id: string) => {
		await apiFetch(`/api/entries/${id}`, { method: 'DELETE' });
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
	}) => {
		editingEntry = entry;
		editModalOpen = true;
	};

	const handleBarcodeScan = async (barcode: string) => {
		const res = await fetch(`/api/foods?barcode=${encodeURIComponent(barcode)}`);
		const data = await res.json();
		if (data.food) {
			addModalOpen = true;
		} else {
			goto(`/foods?barcode=${encodeURIComponent(barcode)}`);
		}
	};

	const totals = $derived(sumEntries(entries));

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
		{#each DEFAULT_MEAL_TYPES as mealType}
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
		mealType={activeMeal}
		onClose={() => {
			addModalOpen = false;
		}}
		onSave={addEntry}
	/>
	<EditEntryModal
		bind:open={editModalOpen}
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
