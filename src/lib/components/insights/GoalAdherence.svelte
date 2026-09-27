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
	import { summarizeGoalAdherence, type GoalRule } from '$lib/analytics/goal-adherence';
	import { formatKcal, formatGrams } from '$lib/utils/number';
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

	const macros: Record<MacroKey, { label: () => string; goalKey: keyof Goals }> = {
		calories: { label: () => m.macro_calories(), goalKey: 'calorieGoal' },
		protein: { label: () => m.macro_protein(), goalKey: 'proteinGoal' },
		carbs: { label: () => m.macro_carbs(), goalKey: 'carbGoal' },
		fat: { label: () => m.macro_fat(), goalKey: 'fatGoal' },
		fiber: { label: () => m.macro_fiber(), goalKey: 'fiberGoal' }
	};

	const formatGoal = (key: MacroKey, value: number) =>
		key === 'calories' ? `${formatKcal(value)} kcal` : `${formatGrams(value)} g`;

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

	const summary = $derived(
		goals
			? summarizeGoalAdherence(data, goals, {
					enabled: activityGoalAdjustment,
					creditPercent: activityCreditPercent
				})
			: null
	);
	const daysWithEntries = $derived(filterDaysWithEntries(data).length);
	const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

	const ruleLabel = (rule: GoalRule, goal: string) => {
		if (rule === 'minimum') return m.insights_goal_rule_minimum({ goal });
		if (rule === 'maximum') return m.insights_goal_rule_maximum({ goal });
		return m.insights_goal_rule_range({ goal });
	};
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
	{:else if summary}
		<div class="rounded-lg border p-4 transition-opacity" class:opacity-60={refreshing}>
			<p class="text-sm font-medium">{m.insights_overall_adherence()}</p>
			<div class="mt-1 flex items-baseline gap-2">
				<span class="text-2xl font-bold tabular-nums">{pct(summary.met, summary.eligible)}%</span>
				<span class="text-muted-foreground text-xs tabular-nums">
					{m.insights_goal_checks_met({
						met: summary.met.toString(),
						total: summary.eligible.toString()
					})}
				</span>
			</div>
			<p class="text-muted-foreground mt-1 text-xs">
				{m.insights_days_with_entries({ count: daysWithEntries.toString() })}
				{#if activityGoalAdjustment}
					· {m.insights_goal_activity_note()}
				{/if}
			</p>
		</div>

		<div class="space-y-4 transition-opacity" class:opacity-60={refreshing}>
			{#each summary.macros as row (row.key)}
				{@const macro = macros[row.key]}
				<div class="space-y-1.5">
					<div class="flex items-baseline justify-between gap-2">
						<div class="min-w-0">
							<span class="text-sm font-medium" style="color: {MACRO_COLORS[row.key]}"
								>{macro.label()}</span
							>
							<span class="text-muted-foreground ml-1 text-xs">
								{ruleLabel(row.rule, formatGoal(row.key, goals[macro.goalKey]))}
							</span>
						</div>
						<span class="text-muted-foreground shrink-0 text-xs tabular-nums">
							{m.insights_goal_days_met({
								met: row.met.toString(),
								total: row.eligible.toString()
							})}
						</span>
					</div>
					<Progress
						value={pct(row.met, row.eligible)}
						class="h-2"
						style="--progress-background: {MACRO_COLORS[
							row.key
						]}40; --progress-foreground: {MACRO_COLORS[row.key]}"
					/>
					{#if row.below > 0 || row.above > 0}
						<p class="text-muted-foreground text-xs tabular-nums">
							{#if row.below > 0}{m.insights_goal_days_below({ count: row.below.toString() })}{/if}
							{#if row.below > 0 && row.above > 0}
								·
							{/if}
							{#if row.above > 0}{m.insights_goal_days_above({ count: row.above.toString() })}{/if}
						</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
