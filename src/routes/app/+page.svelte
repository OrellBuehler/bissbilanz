<script lang="ts">
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import AddFoodModal from '$lib/components/entries/AddFoodModal.svelte';
	import { calculateDailyTotals } from '$lib/utils/nutrition';
	import { progressColor } from '$lib/utils/progress';
	import { today, yesterday } from '$lib/utils/dates';

	let foods: Array<any> = [];
	let entries: Array<any> = [];
	let open = false;
	let activeMeal = 'Breakfast';
	let copying = false;

	const currentDate = today();

	const loadData = async () => {
		const foodsRes = await fetch('/api/foods');
		foods = (await foodsRes.json()).foods;
		const entriesRes = await fetch(`/api/entries?date=${currentDate}`);
		entries = (await entriesRes.json()).entries;
	};

	const addEntry = async (payload: any) => {
		await fetch('/api/entries', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...payload, date: currentDate })
		});
		open = false;
		await loadData();
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
		<button
			class="rounded border px-3 py-1 text-sm"
			onclick={copyYesterday}
			disabled={copying}
		>
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
				open = true;
				activeMeal = 'Breakfast';
			}}
		/>
		<MealSection
			title="Lunch"
			entries={entries.filter((e) => e.mealType === 'Lunch')}
			onAdd={() => {
				open = true;
				activeMeal = 'Lunch';
			}}
		/>
		<MealSection
			title="Dinner"
			entries={entries.filter((e) => e.mealType === 'Dinner')}
			onAdd={() => {
				open = true;
				activeMeal = 'Dinner';
			}}
		/>
		<MealSection
			title="Snacks"
			entries={entries.filter((e) => e.mealType === 'Snacks')}
			onAdd={() => {
				open = true;
				activeMeal = 'Snacks';
			}}
		/>
	</div>
	<AddFoodModal
		{open}
		{foods}
		mealType={activeMeal}
		onClose={() => (open = false)}
		onSave={addEntry}
	/>
</div>
