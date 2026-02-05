<script lang="ts">
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import AddFoodModal from '$lib/components/entries/AddFoodModal.svelte';
	import EditEntryModal from '$lib/components/entries/EditEntryModal.svelte';
	import BarcodeScanModal from '$lib/components/barcode/BarcodeScanModal.svelte';
	import { calculateDailyTotals } from '$lib/utils/nutrition';
	import { progressColor } from '$lib/utils/progress';
	import { today, yesterday } from '$lib/utils/dates';
	import { goto } from '$app/navigation';

	let foods: Array<any> = $state([]);
	let recipes: Array<any> = $state([]);
	let entries: Array<any> = $state([]);
	let addModalOpen = $state(false);
	let editModalOpen = $state(false);
	let scanModalOpen = $state(false);
	let activeMeal = $state('Breakfast');
	let editingEntry: { id: string; servings: number; mealType: string; foodName?: string } | null =
		$state(null);
	let copying = $state(false);
	let scannedFood: any = $state(null);
	let scannedBarcode = $state('');

	const currentDate = today();

	const loadData = async () => {
		const [foodsRes, recipesRes, entriesRes] = await Promise.all([
			fetch('/api/foods'),
			fetch('/api/recipes'),
			fetch(`/api/entries?date=${currentDate}`)
		]);
		foods = (await foodsRes.json()).foods;
		recipes = (await recipesRes.json()).recipes;
		entries = (await entriesRes.json()).entries;
	};

	const addEntry = async (payload: any) => {
		await fetch('/api/entries', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...payload, date: currentDate })
		});
		addModalOpen = false;
		scannedFood = null;
		await loadData();
	};

	const updateEntry = async (payload: { id: string; servings: number; mealType: string }) => {
		await fetch(`/api/entries/${payload.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ servings: payload.servings, mealType: payload.mealType })
		});
		editModalOpen = false;
		editingEntry = null;
		await loadData();
	};

	const deleteEntry = async (id: string) => {
		await fetch(`/api/entries/${id}`, { method: 'DELETE' });
		editModalOpen = false;
		editingEntry = null;
		await loadData();
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

	const copyYesterday = async () => {
		copying = true;
		try {
			await fetch(`/api/entries/copy?fromDate=${yesterday()}&toDate=${currentDate}`, {
				method: 'POST'
			});
			await loadData();
		} finally {
			copying = false;
		}
	};

	const handleBarcodeScan = async (barcode: string) => {
		const res = await fetch(`/api/foods?barcode=${encodeURIComponent(barcode)}`);
		const data = await res.json();
		if (data.food) {
			scannedFood = data.food;
			scannedBarcode = barcode;
			addModalOpen = true;
		} else {
			goto(`/app/foods/new?barcode=${encodeURIComponent(barcode)}`);
		}
	};

	const totals = $derived(calculateDailyTotals(entries));

	loadData();
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold">Today</h1>
		<div class="flex gap-2">
			<button
				class="rounded border px-3 py-1 text-sm"
				onclick={() => (scanModalOpen = true)}
			>
				Scan
			</button>
			<button class="rounded border px-3 py-1 text-sm" onclick={copyYesterday} disabled={copying}>
				{copying ? 'Copying...' : 'Copy Yesterday'}
			</button>
		</div>
	</div>
	<div class={`text-lg ${progressColor(totals.calories, 2000)}`}>
		{totals.calories} kcal
	</div>
	<div class="grid gap-4">
		<MealSection
			title="Breakfast"
			entries={entries.filter((e) => e.mealType === 'Breakfast')}
			onAdd={() => {
				addModalOpen = true;
				activeMeal = 'Breakfast';
			}}
			onEdit={openEditModal}
		/>
		<MealSection
			title="Lunch"
			entries={entries.filter((e) => e.mealType === 'Lunch')}
			onAdd={() => {
				addModalOpen = true;
				activeMeal = 'Lunch';
			}}
			onEdit={openEditModal}
		/>
		<MealSection
			title="Dinner"
			entries={entries.filter((e) => e.mealType === 'Dinner')}
			onAdd={() => {
				addModalOpen = true;
				activeMeal = 'Dinner';
			}}
			onEdit={openEditModal}
		/>
		<MealSection
			title="Snacks"
			entries={entries.filter((e) => e.mealType === 'Snacks')}
			onAdd={() => {
				addModalOpen = true;
				activeMeal = 'Snacks';
			}}
			onEdit={openEditModal}
		/>
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
