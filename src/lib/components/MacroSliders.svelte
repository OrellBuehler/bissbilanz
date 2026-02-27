<script lang="ts">
	import { Slider } from '$lib/components/ui/slider/index.js';
	import * as m from '$lib/paraglide/messages';

	const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;
	const MIN_PCT = 5;
	const MAX_PCT = 80;

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

	function gramsToCalories(protein: number, carbs: number, fat: number) {
		return protein * KCAL_PER_GRAM.protein + carbs * KCAL_PER_GRAM.carbs + fat * KCAL_PER_GRAM.fat;
	}

	function gramsToPct(protein: number, carbs: number, fat: number) {
		const totalCal = gramsToCalories(protein, carbs, fat);
		if (totalCal === 0) return { protein: 34, carbs: 33, fat: 33 };
		return {
			protein: Math.round((protein * KCAL_PER_GRAM.protein / totalCal) * 100),
			carbs: Math.round((carbs * KCAL_PER_GRAM.carbs / totalCal) * 100),
			fat: Math.round((fat * KCAL_PER_GRAM.fat / totalCal) * 100)
		};
	}

	function pctToGrams(pct: number, macro: keyof typeof KCAL_PER_GRAM, calories: number) {
		return Math.round((pct / 100) * calories / KCAL_PER_GRAM[macro]);
	}

	let initial = gramsToPct(proteinGoal, carbGoal, fatGoal);
	let proteinPct = $state(initial.protein);
	let carbsPct = $state(initial.carbs);
	let fatPct = $state(100 - initial.protein - initial.carbs);

	function clamp(val: number) {
		return Math.max(MIN_PCT, Math.min(MAX_PCT, val));
	}

	function rebalance(changed: 'protein' | 'carbs' | 'fat', newVal: number) {
		newVal = clamp(newVal);
		const others = (['protein', 'carbs', 'fat'] as const).filter((k) => k !== changed);
		const pcts = { protein: proteinPct, carbs: carbsPct, fat: fatPct };
		const remaining = 100 - newVal;
		const otherSum = pcts[others[0]] + pcts[others[1]];

		let newOthers: [number, number];
		if (otherSum === 0) {
			newOthers = [Math.round(remaining / 2), remaining - Math.round(remaining / 2)];
		} else {
			const ratio = pcts[others[0]] / otherSum;
			let first = clamp(Math.round(remaining * ratio));
			let second = clamp(remaining - first);
			if (first + second !== remaining) {
				first = remaining - second;
				if (first < MIN_PCT) {
					first = MIN_PCT;
					second = remaining - first;
				}
			}
			newOthers = [first, second];
		}

		pcts[changed] = newVal;
		pcts[others[0]] = newOthers[0];
		pcts[others[1]] = newOthers[1];

		proteinPct = pcts.protein;
		carbsPct = pcts.carbs;
		fatPct = pcts.fat;

		proteinGoal = pctToGrams(proteinPct, 'protein', calorieGoal);
		carbGoal = pctToGrams(carbsPct, 'carbs', calorieGoal);
		fatGoal = pctToGrams(fatPct, 'fat', calorieGoal);
	}

	const macros = [
		{ key: 'protein' as const, label: () => m.goals_protein(), color: 'text-red-500' , trackColor: '[&_[data-slot=slider-range]]:bg-red-500 [&_[data-slot=slider-thumb]]:border-red-500' },
		{ key: 'carbs' as const, label: () => m.goals_carbs(), color: 'text-orange-500', trackColor: '[&_[data-slot=slider-range]]:bg-orange-500 [&_[data-slot=slider-thumb]]:border-orange-500' },
		{ key: 'fat' as const, label: () => m.goals_fat(), color: 'text-yellow-500', trackColor: '[&_[data-slot=slider-range]]:bg-yellow-500 [&_[data-slot=slider-thumb]]:border-yellow-500' }
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
				value={[pct]}
				min={MIN_PCT}
				max={MAX_PCT}
				step={1}
				class={macro.trackColor}
				onValueChange={(v) => rebalance(macro.key, v[0])}
			/>
		</div>
	{/each}
</div>
