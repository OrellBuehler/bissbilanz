<script lang="ts">
	import { page } from '$app/stores';
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import MacroSummary from '$lib/components/MacroSummary.svelte';
	import { calculateDailyTotals } from '$lib/utils/nutrition';
	import { progressColor } from '$lib/utils/progress';
	import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';

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
		{#each DEFAULT_MEAL_TYPES as mealType}
			<MealSection
				title={mealType}
				entries={entries.filter((e) => e.mealType === mealType)}
				readonly
			/>
		{/each}
	</div>

	<div class="rounded border p-4">
		<h3 class="mb-2 font-semibold">Daily Totals</h3>
		<MacroSummary {totals} gridClass="grid-cols-2 md:grid-cols-5" />
	</div>
</div>
