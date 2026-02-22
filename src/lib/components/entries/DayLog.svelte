<script lang="ts">
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import AddFoodModal from '$lib/components/entries/AddFoodModal.svelte';
	import EditEntryModal from '$lib/components/entries/EditEntryModal.svelte';
	import BarcodeScanModal from '$lib/components/barcode/BarcodeScanModal.svelte';
	import MacroSummary from '$lib/components/MacroSummary.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { calculateDailyTotals } from '$lib/utils/nutrition';
	import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/utils/api';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		date: string;
		refreshKey?: number;
		onMutation?: () => void;
	};

	let { date, refreshKey = 0, onMutation }: Props = $props();

	let foods: Array<any> = $state([]);
	let recipes: Array<any> = $state([]);
	let entries: Array<any> = $state([]);
	let addModalOpen = $state(false);
	let editModalOpen = $state(false);
	let scanModalOpen = $state(false);
	let activeMeal = $state('Breakfast');
	let editingEntry: { id: string; servings: number; mealType: string; foodName?: string } | null =
		$state(null);
	let scannedFood: any = $state(null);
	let scannedBarcode = $state('');

	const loadData = async () => {
		const [foodsRes, recipesRes, entriesRes] = await Promise.all([
			fetch('/api/foods'),
			fetch('/api/recipes'),
			fetch(`/api/entries?date=${date}`)
		]);
		foods = (await foodsRes.json()).foods;
		recipes = (await recipesRes.json()).recipes;
		entries = (await entriesRes.json()).entries;
	};

	const addEntry = async (payload: any) => {
		await apiFetch('/api/entries', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...payload, date })
		});
		addModalOpen = false;
		scannedFood = null;
		await loadData();
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
		await loadData();
		onMutation?.();
	};

	const deleteEntry = async (id: string) => {
		await apiFetch(`/api/entries/${id}`, { method: 'DELETE' });
		editModalOpen = false;
		editingEntry = null;
		await loadData();
		onMutation?.();
	};

	const openEditModal = (entry: {
		id: string;
		servings: number;
		mealType: string;
		foodName?: string;
	}) => {
		editingEntry = entry;
		editModalOpen = true;
	};

	const handleBarcodeScan = async (barcode: string) => {
		const res = await fetch(`/api/foods?barcode=${encodeURIComponent(barcode)}`);
		const data = await res.json();
		if (data.food) {
			scannedFood = data.food;
			scannedBarcode = barcode;
			addModalOpen = true;
		} else {
			goto(`/foods/new?barcode=${encodeURIComponent(barcode)}`);
		}
	};

	const totals = $derived(calculateDailyTotals(entries));

	$effect(() => {
		if (date) { loadData(); }
		refreshKey; // track refreshKey to re-run on increment
	});
</script>

<div class="space-y-4">
	<div class="flex justify-end">
		<Button variant="outline" size="sm" onclick={() => (scanModalOpen = true)}>
			{m.dashboard_scan()}
		</Button>
	</div>

	<div class="grid gap-4">
		{#each DEFAULT_MEAL_TYPES as mealType}
			<MealSection
				title={mealType}
				entries={entries.filter((e) => e.mealType === mealType)}
				onAdd={() => {
					addModalOpen = true;
					activeMeal = mealType;
				}}
				onEdit={openEditModal}
			/>
		{/each}
	</div>

	<div class="rounded border p-4">
		<MacroSummary {totals} round gridClass="grid-cols-2 md:grid-cols-5" />
	</div>

	<AddFoodModal
		open={addModalOpen}
		{foods}
		{recipes}
		mealType={activeMeal}
		onClose={() => {
			addModalOpen = false;
			scannedFood = null;
		}}
		onSave={addEntry}
	/>
	<EditEntryModal
		open={editModalOpen}
		entry={editingEntry}
		onClose={() => {
			editModalOpen = false;
			editingEntry = null;
		}}
		onSave={updateEntry}
		onDelete={deleteEntry}
	/>
	<BarcodeScanModal
		open={scanModalOpen}
		onClose={() => (scanModalOpen = false)}
		onBarcode={handleBarcodeScan}
	/>
</div>
