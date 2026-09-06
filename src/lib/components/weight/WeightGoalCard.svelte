<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Target from '@lucide/svelte/icons/target';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Settings2 from '@lucide/svelte/icons/settings-2';
	import { formatKg } from '$lib/utils/number';
	import { formatDateLabel } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';
	import type { GoalProjection } from '$lib/analytics/weight-goal';

	let { projection }: { projection: GoalProjection | null } = $props();

	const statusLabel = $derived.by(() => {
		switch (projection?.status) {
			case 'reached':
				return m.weight_target_reached();
			case 'on_track':
				return m.weight_target_on_track();
			case 'behind':
				return m.weight_target_behind();
			case 'stalled':
				return m.weight_target_stalled();
			default:
				return m.weight_target_unknown();
		}
	});

	const statusClass = $derived.by(() => {
		switch (projection?.status) {
			case 'reached':
			case 'on_track':
				return 'bg-green-500/10 text-green-700 dark:text-green-400';
			case 'behind':
				return 'bg-orange-500/10 text-orange-700 dark:text-orange-400';
			case 'stalled':
				return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
			default:
				return 'bg-muted text-muted-foreground';
		}
	});
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-center justify-between gap-2 pb-3">
		<div class="flex items-center gap-2">
			<div
				class="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"
			>
				<Target class="size-4" />
			</div>
			<Card.Title class="text-base tracking-tight">{m.weight_target()}</Card.Title>
		</div>
		<Button variant="ghost" size="sm" href="/goals" class="gap-1.5">
			<Settings2 class="size-3.5" />
			{projection ? m.weight_target_edit() : m.weight_target_set()}
		</Button>
	</Card.Header>
	<Card.Content class="pt-0">
		{#if !projection}
			<p class="text-sm text-muted-foreground">{m.weight_target_none()}</p>
		{:else}
			<div class="space-y-3">
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium {statusClass}"
					>
						{#if projection.reached}
							<CircleCheck class="size-3.5" />
						{/if}
						{statusLabel}
					</span>
					{#if projection.daysUntilTargetDate != null}
						<span class="text-xs text-muted-foreground">
							{projection.daysUntilTargetDate > 0
								? m.weight_target_days_left({ days: String(projection.daysUntilTargetDate) })
								: m.weight_target_date_passed()}
						</span>
					{/if}
				</div>

				<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
					<div class="rounded-lg bg-muted/30 p-2">
						<p class="text-[11px] text-muted-foreground">{m.weight_target_value()}</p>
						<p class="mt-0.5 text-sm font-semibold tabular-nums">
							{formatKg(projection.targetWeightKg)} kg
						</p>
					</div>
					<div class="rounded-lg bg-muted/30 p-2">
						<p class="text-[11px] text-muted-foreground">{m.weight_target_remaining()}</p>
						<p class="mt-0.5 text-sm font-semibold tabular-nums">
							{projection.reached ? '—' : `${formatKg(Math.abs(projection.remainingKg))} kg`}
						</p>
					</div>
					<div class="rounded-lg bg-muted/30 p-2">
						<p class="text-[11px] text-muted-foreground">{m.weight_target_projected()}</p>
						<p class="mt-0.5 text-sm font-semibold tabular-nums">
							{projection.projectedDate ? formatDateLabel(projection.projectedDate) : '—'}
						</p>
					</div>
					<div class="rounded-lg bg-muted/30 p-2">
						<p class="text-[11px] text-muted-foreground">{m.weight_target_by_date()}</p>
						<p class="mt-0.5 text-sm font-semibold tabular-nums">
							{projection.targetDate ? formatDateLabel(projection.targetDate) : '—'}
						</p>
					</div>
				</div>

				{#if projection.requiredRatePerWeekKg != null}
					<div class="flex items-center justify-between border-t pt-2">
						<span class="text-xs text-muted-foreground">{m.weight_target_required_rate()}</span>
						<span class="text-sm font-semibold tabular-nums">
							{projection.requiredRatePerWeekKg >= 0
								? '+'
								: ''}{projection.requiredRatePerWeekKg.toFixed(2)}
							{m.analytics_kg_per_week()}
						</span>
					</div>
				{/if}

				{#if !projection.reached && projection.projectedDate === null}
					<p class="text-[11px] text-muted-foreground">{m.weight_target_no_projection()}</p>
				{/if}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
