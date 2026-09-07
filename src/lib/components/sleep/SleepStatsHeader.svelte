<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import Moon from '@lucide/svelte/icons/moon';
	import Clock from '@lucide/svelte/icons/clock';
	import Sunrise from '@lucide/svelte/icons/sunrise';
	import Star from '@lucide/svelte/icons/star';
	import { computeSleepStats, formatClockMinutes } from '$lib/utils/sleep-stats';
	import * as m from '$lib/paraglide/messages';
	import type { DexieSleepEntry } from '$lib/db/types';

	let { entries }: { entries: DexieSleepEntry[] } = $props();

	const stats = $derived(computeSleepStats(entries));

	const formatDuration = (minutes: number) => {
		const hours = Math.floor(minutes / 60);
		const rest = Math.round(minutes % 60);
		if (rest === 0) return m.sleep_hours_exact({ hours: String(hours) });
		return m.sleep_hours({ hours: String(hours), minutes: String(rest) });
	};

	const cards = $derived([
		{
			label: m.sleep_stats_last_night(),
			icon: Moon,
			value: stats.lastNight ? formatDuration(stats.lastNight.durationMinutes) : null,
			hint: stats.lastNight
				? m.sleep_stats_quality_value({ quality: String(stats.lastNight.quality) })
				: null
		},
		{
			label: m.sleep_stats_avg_duration(),
			icon: Clock,
			value:
				stats.averageDurationMinutes === null ? null : formatDuration(stats.averageDurationMinutes),
			hint: stats.nights > 0 ? m.sleep_stats_nights({ count: String(stats.nights) }) : null
		},
		{
			label: m.sleep_stats_avg_schedule(),
			icon: Sunrise,
			value:
				stats.averageBedtimeMinutes === null && stats.averageWakeTimeMinutes === null
					? null
					: `${stats.averageBedtimeMinutes === null ? '--:--' : formatClockMinutes(stats.averageBedtimeMinutes)} – ${stats.averageWakeTimeMinutes === null ? '--:--' : formatClockMinutes(stats.averageWakeTimeMinutes)}`,
			hint: m.sleep_stats_bedtime_wake()
		},
		{
			label: m.sleep_stats_avg_quality(),
			icon: Star,
			value: stats.averageQuality === null ? null : `${stats.averageQuality.toFixed(1)} / 10`,
			hint: null
		}
	]);
</script>

<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
	{#each cards as card (card.label)}
		{@const Icon = card.icon}
		<Card.Root class="overflow-hidden">
			<Card.Content class="flex flex-col gap-1 p-3 sm:p-4">
				<div class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
					<Icon class="size-3.5 text-purple-600 dark:text-purple-400" />
					<span class="truncate">{card.label}</span>
				</div>
				<span class="text-xl font-semibold tabular-nums sm:text-2xl">
					{card.value ?? '—'}
				</span>
				{#if card.value && card.hint}
					<span class="text-muted-foreground truncate text-xs">{card.hint}</span>
				{/if}
			</Card.Content>
		</Card.Root>
	{/each}
</div>
