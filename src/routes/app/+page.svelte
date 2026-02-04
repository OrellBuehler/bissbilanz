<script lang="ts">
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import AddFoodModal from '$lib/components/entries/AddFoodModal.svelte';
	import EditEntryModal from '$lib/components/entries/EditEntryModal.svelte';
	import { calculateDailyTotals } from '$lib/utils/nutrition';
	import { progressColor } from '$lib/utils/progress';
	import { today, yesterday } from '$lib/utils/dates';

	let foods: Array<any> = [];
	let recipes: Array<any> = [];
	let entries: Array<any> = [];
	let addModalOpen = false;
	let editModalOpen = false;
	let activeMeal = 'Breakfast';
	let editingEntry: { id: string; servings: number; mealType: string; foodName?: string } | null =
		null;
	let copying = false;

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

	const totals = () => calculateDailyTotals(entries);

	loadData();
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold">Today</h1>
		<button class="rounded border px-3 py-1 text-sm" onclick={copyYesterday} disabled={copying}>
			{copying ? 'Copying...' : 'Copy Yesterday'}
		</button>
	</div>
	<div class={`text-lg ${progressColor(totals().calories, 2000)}`}>
		{totals().calories} kcal
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
		onClose={() => (addModalOpen = false)}
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
</div>
