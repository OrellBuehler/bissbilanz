<script lang="ts">
	import { page } from '$app/stores';
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import { calculateDailyTotals } from '$lib/utils/nutrition';
	import { progressColor } from '$lib/utils/progress';

	let entries: Array<any> = $state([]);

	const date = $derived($page.params.date);

	const loadData = async () => {
		const res = await fetch(`/api/entries?date=${date}`);
		entries = (await res.json()).entries;
	};

	const totals = $derived(calculateDailyTotals(entries));

	$effect(() => {
		if (date) {
			loadData();
		}
	});
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold">{date}</h1>
		<a href="/app/history" class="rounded border px-3 py-1 text-sm">Back to Calendar</a>
	</div>

	<div class={`text-lg ${progressColor(totals.calories, 2000)}`}>{totals.calories} kcal</div>

	<div class="grid gap-4">
		<MealSection
			title="Breakfast"
			entries={entries.filter((e) => e.mealType === 'Breakfast')}
			readonly
		/>
		<MealSection title="Lunch" entries={entries.filter((e) => e.mealType === 'Lunch')} readonly />
		<MealSection
			title="Dinner"
			entries={entries.filter((e) => e.mealType === 'Dinner')}
			readonly
		/>
		<MealSection
			title="Snacks"
			entries={entries.filter((e) => e.mealType === 'Snacks')}
			readonly
		/>
	</div>

	<div class="rounded border p-4">
		<h3 class="mb-2 font-semibold">Daily Totals</h3>
		<div class="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
			<div>Calories: {totals.calories}</div>
			<div>Protein: {totals.protein}g</div>
			<div>Carbs: {totals.carbs}g</div>
			<div>Fat: {totals.fat}g</div>
			<div>Fiber: {totals.fiber}g</div>
		</div>
	</div>
</div>
