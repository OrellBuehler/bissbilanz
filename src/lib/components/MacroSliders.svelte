<script lang="ts">
	import { Slider } from '$lib/components/ui/slider/index.js';
	import * as m from '$lib/paraglide/messages';
	import { gramsToPct, pctToGrams, MIN_PCT, MAX_PCT } from '$lib/utils/macro-calc';

	let {
		calorieGoal,
		proteinGoal = $bindable(),
		carbGoal = $bindable(),
		fatGoal = $bindable(),
		totalPct = $bindable(100)
	}: {
		calorieGoal: number;
		proteinGoal: number;
		carbGoal: number;
		fatGoal: number;
		totalPct?: number;
	} = $props();

	let initial = gramsToPct(proteinGoal, carbGoal, fatGoal);
	let proteinPct = $state(Math.max(MIN_PCT, Math.min(MAX_PCT, initial.protein)));
	let carbsPct = $state(Math.max(MIN_PCT, Math.min(MAX_PCT, initial.carbs)));
	let fatPct = $state(Math.max(MIN_PCT, Math.min(MAX_PCT, initial.fat)));

	function setPct(key: 'protein' | 'carbs' | 'fat', val: number) {
		if (key === 'protein') proteinPct = val;
		else if (key === 'carbs') carbsPct = val;
		else fatPct = val;
	}

	$effect(() => {
		totalPct = proteinPct + carbsPct + fatPct;
	});

	$effect(() => {
		proteinGoal = pctToGrams(proteinPct, 'protein', calorieGoal);
		carbGoal = pctToGrams(carbsPct, 'carbs', calorieGoal);
		fatGoal = pctToGrams(fatPct, 'fat', calorieGoal);
	});

	const macros = [
		{
			key: 'protein' as const,
			label: () => m.goals_protein(),
			color: 'text-red-500',
			trackColor:
				'[&_[data-slot=slider-range]]:bg-red-500 [&_[data-slot=slider-thumb]]:border-red-500'
		},
		{
			key: 'carbs' as const,
			label: () => m.goals_carbs(),
			color: 'text-orange-500',
			trackColor:
				'[&_[data-slot=slider-range]]:bg-orange-500 [&_[data-slot=slider-thumb]]:border-orange-500'
		},
		{
			key: 'fat' as const,
			label: () => m.goals_fat(),
			color: 'text-yellow-500',
			trackColor:
				'[&_[data-slot=slider-range]]:bg-yellow-500 [&_[data-slot=slider-thumb]]:border-yellow-500'
		}
	] as const;

	function getPct(key: 'protein' | 'carbs' | 'fat') {
		if (key === 'protein') return proteinPct;
		if (key === 'carbs') return carbsPct;
		return fatPct;
	}

	function getGrams(key: 'protein' | 'carbs' | 'fat') {
		return pctToGrams(getPct(key), key, calorieGoal);
	}
</script>

<div class="space-y-5">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-medium">{m.goals_macro_split()}</h3>
		<span
			class="text-sm font-medium {totalPct === 100
				? 'text-green-500'
				: 'text-destructive'}"
		>
			{m.goals_total()}: {totalPct}%
		</span>
	</div>
	{#each macros as macro}
		{@const pct = getPct(macro.key)}
		{@const grams = getGrams(macro.key)}
		<div class="touch-none space-y-2">
			<div class="flex items-center justify-between text-sm">
				<span class={macro.color}>{macro.label()}</span>
				<span class="text-muted-foreground">{pct}% &middot; {grams}g</span>
			</div>
			<Slider
				type="single"
				value={pct}
				min={MIN_PCT}
				max={MAX_PCT}
				step={1}
				class={macro.trackColor}
				onValueChange={(v: number) => setPct(macro.key, v)}
			/>
		</div>
	{/each}
</div>
