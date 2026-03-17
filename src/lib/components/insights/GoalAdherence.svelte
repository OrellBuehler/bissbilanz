<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { MACRO_COLORS } from '$lib/colors';
	import { today, shiftDate } from '$lib/utils/dates';
	import { statsService } from '$lib/services/stats-service.svelte';
	import {
		filterDaysWithEntries,
		strictCount as _strictCount,
		tolerantCount as _tolerantCount,
		overallAdherence,
		type DayRow,
		type Goals,
		type MacroKey
	} from '$lib/utils/insights';
	import * as m from '$lib/paraglide/messages';

	type RangeKey = '7d' | '30d' | '90d';
	let range: RangeKey = $state('7d');
	let data: DayRow[] = $state([]);
	let goals = $state<Goals | null>(null);
	let loading = $state(true);

	const rangeDays: Record<RangeKey, number> = { '7d': 6, '30d': 29, '90d': 89 };
	const rangeLabels: Record<RangeKey, () => string> = {
		'7d': () => m.insights_7d(),
		'30d': () => m.insights_30d(),
		'90d': () => m.insights_90d()
	};

	const macros: { key: MacroKey; label: () => string; goalKey: keyof NonNullable<Goals> }[] = [
		{ key: 'calories', label: () => m.macro_calories(), goalKey: 'calorieGoal' },
		{ key: 'protein', label: () => m.macro_protein(), goalKey: 'proteinGoal' },
		{ key: 'carbs', label: () => m.macro_carbs(), goalKey: 'carbGoal' },
		{ key: 'fat', label: () => m.macro_fat(), goalKey: 'fatGoal' },
		{ key: 'fiber', label: () => m.macro_fiber(), goalKey: 'fiberGoal' }
	];

	const fetchData = async (r: RangeKey) => {
		loading = true;
		try {
			const end = today();
			const start = shiftDate(end, -rangeDays[r]);
			const result = await statsService.getDailyStatus(start, end);
			if (result) {
				data = result.data;
				goals = result.goals;
			}
		} catch {
			data = [];
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		fetchData(range);
	});

	const daysWithEntries = $derived(filterDaysWithEntries(data));
	const totalDays = $derived(daysWithEntries.length);

	function strictCount(key: MacroKey, goalVal: number): number {
		return _strictCount(daysWithEntries, key, goalVal);
	}

	function tolerantCount(key: MacroKey, goalVal: number): number {
		return _tolerantCount(daysWithEntries, key, goalVal);
	}

	const overallStrict = $derived.by(() => {
		if (!goals) return 0;
		return overallAdherence(data, goals, _strictCount);
	});

	const overallTolerant = $derived.by(() => {
		if (!goals) return 0;
		return overallAdherence(data, goals, _tolerantCount);
	});
</script>

<div class="space-y-3">
	<div class="flex items-center justify-end">
		<div class="flex gap-1">
			{#each ['7d', '30d', '90d'] as const as r (r)}
				<Button variant={range === r ? 'default' : 'outline'} size="sm" onclick={() => (range = r)}>
					{rangeLabels[r]()}
				</Button>
			{/each}
		</div>
	</div>

	{#if loading}
		<div class="text-muted-foreground flex h-[200px] items-center justify-center text-sm">
			{m.add_food_loading()}
		</div>
	{:else if !goals}
		<div class="text-muted-foreground flex h-[200px] items-center justify-center text-sm">
			{m.insights_no_goals()}
		</div>
	{:else}
		<div class="rounded-lg border p-4">
			<p class="text-sm font-medium">{m.insights_overall_adherence()}</p>
			<div class="mt-2 flex gap-6">
				<div>
					<span class="text-2xl font-bold tabular-nums">{overallTolerant}%</span>
					<span class="text-muted-foreground ml-1 text-xs">{m.insights_tolerant()}</span>
				</div>
				<div>
					<span class="text-2xl font-bold tabular-nums">{overallStrict}%</span>
					<span class="text-muted-foreground ml-1 text-xs">{m.insights_strict()}</span>
				</div>
			</div>
		</div>

		<div class="space-y-4">
			{#each macros as macro (macro.key)}
				{@const goalVal = goals[macro.goalKey]}
				{#if goalVal}
					{@const strict = strictCount(macro.key, goalVal)}
					{@const tolerant = tolerantCount(macro.key, goalVal)}
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium" style="color: {MACRO_COLORS[macro.key]}"
								>{macro.label()}</span
							>
							<span class="text-muted-foreground text-xs tabular-nums">
								{m.insights_days_in_range({
									count: tolerant.toString(),
									total: totalDays.toString()
								})}
							</span>
						</div>
						<div class="space-y-1">
							<div class="flex items-center gap-2">
								<span class="text-muted-foreground w-16 text-xs">{m.insights_tolerant()}</span>
								<div class="flex-1">
									<Progress
										value={totalDays > 0 ? (tolerant / totalDays) * 100 : 0}
										class="h-2"
										style="--progress-background: {MACRO_COLORS[
											macro.key
										]}40; --progress-foreground: {MACRO_COLORS[macro.key]}"
									/>
								</div>
								<span class="text-muted-foreground w-8 text-right text-xs tabular-nums"
									>{totalDays > 0 ? Math.round((tolerant / totalDays) * 100) : 0}%</span
								>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-muted-foreground w-16 text-xs">{m.insights_strict()}</span>
								<div class="flex-1">
									<Progress
										value={totalDays > 0 ? (strict / totalDays) * 100 : 0}
										class="h-2"
										style="--progress-background: {MACRO_COLORS[
											macro.key
										]}40; --progress-foreground: {MACRO_COLORS[macro.key]}"
									/>
								</div>
								<span class="text-muted-foreground w-8 text-right text-xs tabular-nums"
									>{totalDays > 0 ? Math.round((strict / totalDays) * 100) : 0}%</span
								>
							</div>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
