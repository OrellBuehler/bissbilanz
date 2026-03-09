<script lang="ts">
	import { Slider } from '$lib/components/ui/slider/index.js';
	import * as m from '$lib/paraglide/messages';
	import {
		type Macro,
		gramsToPct,
		pctToGrams,
		clamp,
		MIN_PCT,
		MAX_PCT
	} from '$lib/utils/macro-calc';

	let {
		calorieGoal,
		proteinGoal = $bindable(),
		carbGoal = $bindable(),
		fatGoal = $bindable(),
		onValidChange
	}: {
		calorieGoal: number;
		proteinGoal: number;
		carbGoal: number;
		fatGoal: number;
		onValidChange?: (valid: boolean) => void;
	} = $props();

	let initial = gramsToPct(proteinGoal, carbGoal, fatGoal);
	let pcts = $state({
		protein: clamp(initial.protein),
		carbs: clamp(initial.carbs),
		fat: clamp(100 - clamp(initial.protein) - clamp(initial.carbs))
	});

	let totalPct = $derived(pcts.protein + pcts.carbs + pcts.fat);

	let prevValid: boolean | undefined;
	$effect(() => {
		const valid = totalPct === 100;
		if (valid !== prevValid) {
			prevValid = valid;
			onValidChange?.(valid);
		}
	});

	$effect(() => {
		proteinGoal = pctToGrams(pcts.protein, 'protein', calorieGoal);
		carbGoal = pctToGrams(pcts.carbs, 'carbs', calorieGoal);
		fatGoal = pctToGrams(pcts.fat, 'fat', calorieGoal);
	});

	const macros = [
		{
			key: 'protein' as Macro,
			label: () => m.goals_protein(),
			color: 'text-red-500',
			trackColor:
				'[&_[data-slot=slider-range]]:bg-red-500 [&_[data-slot=slider-thumb]]:border-red-500'
		},
		{
			key: 'carbs' as Macro,
			label: () => m.goals_carbs(),
			color: 'text-orange-500',
			trackColor:
				'[&_[data-slot=slider-range]]:bg-orange-500 [&_[data-slot=slider-thumb]]:border-orange-500'
		},
		{
			key: 'fat' as Macro,
			label: () => m.goals_fat(),
			color: 'text-yellow-500',
			trackColor:
				'[&_[data-slot=slider-range]]:bg-yellow-500 [&_[data-slot=slider-thumb]]:border-yellow-500'
		}
	] as const;

	const goals = { protein: () => proteinGoal, carbs: () => carbGoal, fat: () => fatGoal };
</script>

<div class="space-y-5">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-medium">{m.goals_macro_split()}</h3>
		<span class="text-sm font-medium {totalPct === 100 ? 'text-green-500' : 'text-destructive'}">
			{m.goals_total()}: {totalPct}%
		</span>
	</div>
	{#each macros as macro}
		<div class="touch-none space-y-2">
			<div class="flex items-center justify-between text-sm">
				<span class={macro.color}>{macro.label()}</span>
				<span class="text-muted-foreground">{pcts[macro.key]}% &middot; {goals[macro.key]()}g</span>
			</div>
			<Slider
				type="single"
				value={pcts[macro.key]}
				min={MIN_PCT}
				max={MAX_PCT}
				step={1}
				class={macro.trackColor}
				onValueChange={(v: number) => (pcts[macro.key] = v)}
			/>
		</div>
	{/each}
</div>
