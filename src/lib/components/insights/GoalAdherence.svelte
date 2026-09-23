<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { MACRO_COLORS } from '$lib/colors';
	import { today, shiftDate } from '$lib/utils/dates';
	import { statsService } from '$lib/services/stats-service.svelte';
	import {
		filterDaysWithEntries,
		type DayRow,
		type Goals,
		type MacroKey
	} from '$lib/utils/insights';
	import { adjustGoalsForActivity } from '$lib/utils/activity-goals';
	import * as Sentry from '@sentry/sveltekit';
	import * as m from '$lib/paraglide/messages';

	type InitialData = {
		data: DayRow[];
		goals: Goals | null;
		activityGoalAdjustment?: boolean;
		activityCreditPercent?: number;
	};

	let { initialData }: { initialData?: InitialData } = $props();

	type RangeKey = '7d' | '30d' | '90d';
	let range: RangeKey = $state('7d');
	let data: DayRow[] = $state(initialData?.data ?? []);
	let goals = $state<Goals | null>(initialData?.goals ?? null);
	let activityGoalAdjustment = $state(initialData?.activityGoalAdjustment ?? false);
	let activityCreditPercent = $state(initialData?.activityCreditPercent ?? 100);
	let loading = $state(!initialData);
	let refreshing = $state(false);

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
		refreshing = true;
		try {
			const end = today();
			const start = shiftDate(end, -rangeDays[r]);
			const result = await statsService.getDailyStatus(start, end);
			if (result) {
				data = result.data;
				goals = result.goals;
				activityGoalAdjustment = result.activityGoalAdjustment ?? false;
				activityCreditPercent = result.activityCreditPercent ?? 100;
			}
		} catch (err) {
			Sentry.captureException(err, { extra: { range: r } });
			data = [];
		} finally {
			loading = false;
			refreshing = false;
		}
	};

	let initialized = !!initialData;
	$effect(() => {
		const r = range;
		if (initialized && r === '7d') {
			initialized = false;
			return;
		}
		initialized = false;
		fetchData(r);
	});

	const daysWithEntries = $derived(filterDaysWithEntries(data));
	const totalDays = $derived(daysWithEntries.length);

	// Each day's goal is raised by its own activityCalories (when the user has
	// opted in) before it's compared against that day's totals — see
	// $lib/utils/activity-goals.ts.
	const adjustedGoalsByDay = $derived(
		goals
			? daysWithEntries.map((day) =>
					adjustGoalsForActivity(goals, day.activityCalories ?? null, {
						enabled: activityGoalAdjustment,
						creditPercent: activityCreditPercent
					})
				)
			: []
	);

	function strictCount(key: MacroKey, goalKey: keyof NonNullable<Goals>): number {
		let hits = 0;
		for (let i = 0; i < daysWithEntries.length; i++) {
			const goalVal = adjustedGoalsByDay[i]?.[goalKey] ?? 0;
			if (goalVal > 0 && daysWithEntries[i][key] >= goalVal) hits++;
		}
		return hits;
	}

	function tolerantCount(key: MacroKey, goalKey: keyof NonNullable<Goals>): number {
		let hits = 0;
		for (let i = 0; i < daysWithEntries.length; i++) {
			const goalVal = adjustedGoalsByDay[i]?.[goalKey] ?? 0;
			if (goalVal <= 0) continue;
			const value = daysWithEntries[i][key];
			if (value >= goalVal * 0.9 && value <= goalVal * 1.1) hits++;
		}
		return hits;
	}

	function overallAdherenceAdjusted(mode: 'strict' | 'tolerant'): number {
		if (!goals) return 0;
		let total = 0;
		let hit = 0;
		for (const macro of macros) {
			// Skip macros the user never set a goal for, same as before per-day
			// adjustment — a day's own adjusted value only ever raises this base.
			if (!goals[macro.goalKey]) continue;
			total += totalDays;
			hit +=
				mode === 'strict'
					? strictCount(macro.key, macro.goalKey)
					: tolerantCount(macro.key, macro.goalKey);
		}
		return total > 0 ? Math.round((hit / total) * 100) : 0;
	}

	const overallStrict = $derived.by(() => {
		if (!goals || totalDays === 0) return 0;
		return overallAdherenceAdjusted('strict');
	});

	const overallTolerant = $derived.by(() => {
		if (!goals || totalDays === 0) return 0;
		return overallAdherenceAdjusted('tolerant');
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
		<div class="rounded-lg border p-4 transition-opacity" class:opacity-60={refreshing}>
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

		<div class="space-y-4 transition-opacity" class:opacity-60={refreshing}>
			{#each macros as macro (macro.key)}
				{@const goalVal = goals[macro.goalKey]}
				{#if goalVal}
					{@const strict = strictCount(macro.key, macro.goalKey)}
					{@const tolerant = tolerantCount(macro.key, macro.goalKey)}
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
