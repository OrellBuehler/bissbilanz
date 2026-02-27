<script lang="ts">
	import { Slider } from '$lib/components/ui/slider/index.js';
	import * as m from '$lib/paraglide/messages';
	import {
		gramsToPct,
		pctToGrams,
		clamp,
		rebalance as rebalancePcts,
		MIN_PCT,
		MAX_PCT
	} from '$lib/utils/macro-calc';

	let {
		calorieGoal,
		proteinGoal = $bindable(),
		carbGoal = $bindable(),
		fatGoal = $bindable()
	}: {
		calorieGoal: number;
		proteinGoal: number;
		carbGoal: number;
		fatGoal: number;
	} = $props();

	let initial = gramsToPct(proteinGoal, carbGoal, fatGoal);
	let proteinPct = $state(clamp(initial.protein));
	let carbsPct = $state(clamp(initial.carbs));
	let fatPct = $state(clamp(100 - clamp(initial.protein) - clamp(initial.carbs)));

	function rebalance(changed: 'protein' | 'carbs' | 'fat', newVal: number) {
		const result = rebalancePcts(changed, newVal, {
			protein: proteinPct,
			carbs: carbsPct,
			fat: fatPct
		});

		proteinPct = result.protein;
		carbsPct = result.carbs;
		fatPct = result.fat;

		proteinGoal = pctToGrams(proteinPct, 'protein', calorieGoal);
		carbGoal = pctToGrams(carbsPct, 'carbs', calorieGoal);
		fatGoal = pctToGrams(fatPct, 'fat', calorieGoal);
	}

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
	<h3 class="text-sm font-medium">{m.goals_macro_split()}</h3>
	{#each macros as macro}
		{@const pct = getPct(macro.key)}
		{@const grams = getGrams(macro.key)}
		<div class="space-y-2">
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
				onValueChange={(v: number) => rebalance(macro.key, v)}
			/>
		</div>
	{/each}
</div>
