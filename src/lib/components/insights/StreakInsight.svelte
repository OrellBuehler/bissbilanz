<script lang="ts">
	import Flame from '@lucide/svelte/icons/flame';
	import Trophy from '@lucide/svelte/icons/trophy';
	import { statsService } from '$lib/services/stats-service.svelte';
	import { today, shiftDate } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';

	type Streaks = {
		currentStreak: number;
		longestStreak: number;
	};

	type CalendarDay = { calories: number; hasEntries: boolean };

	let {
		initialStreaks,
		initialDays
	}: { initialStreaks?: Streaks; initialDays?: Record<string, CalendarDay> } = $props();

	let streaks = $state<Streaks>(initialStreaks ?? { currentStreak: 0, longestStreak: 0 });
	let days: Record<string, CalendarDay> = $state(initialDays ?? {});
	let loading = $state(!initialStreaks);

	const isPersonalBest = $derived(
		streaks.currentStreak === streaks.longestStreak && streaks.currentStreak > 0
	);

	const recentDates = $derived.by(() => {
		const result: string[] = [];
		const todayStr = today();
		for (let i = 27; i >= 0; i--) {
			result.push(shiftDate(todayStr, -i));
		}
		return result;
	});

	const fetchData = async () => {
		loading = true;
		try {
			const [streakResult, calResult] = await Promise.all([
				statsService.getStreaks(),
				statsService.getDailyStatus(shiftDate(today(), -27), today())
			]);
			if (streakResult) {
				streaks = streakResult;
			}
			if (calResult) {
				const map: Record<string, CalendarDay> = {};
				for (const d of calResult.data) {
					map[d.date] = { calories: d.calories, hasEntries: d.calories > 0 };
				}
				days = map;
			}
		} catch {
			// silently ignore
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		if (!initialStreaks) {
			fetchData();
		}
	});
</script>

{#if loading}
	<div class="text-muted-foreground flex h-[120px] items-center justify-center text-sm">
		{m.add_food_loading()}
	</div>
{:else}
	<div class="space-y-4">
		<div class="grid grid-cols-2 gap-3">
			<div class="rounded-xl border p-4">
				<div class="mb-1 flex items-center gap-1.5">
					<Flame class="size-4 text-orange-500" />
					<span class="text-muted-foreground text-xs font-medium uppercase tracking-wider"
						>{m.insights_streak_current()}</span
					>
				</div>
				<div class="flex items-baseline gap-1.5">
					<span class="text-3xl font-bold tabular-nums">{streaks.currentStreak}</span>
					<span class="text-muted-foreground text-sm">
						{streaks.currentStreak === 1 ? m.streaks_day() : m.streaks_days_unit()}
					</span>
				</div>
				{#if isPersonalBest && streaks.currentStreak > 0}
					<span
						class="mt-1 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
					>
						{m.streaks_personal_best()}
					</span>
				{/if}
				{#if streaks.currentStreak === 0}
					<p class="text-muted-foreground mt-1 text-xs">{m.streaks_no_streak()}</p>
				{/if}
			</div>

			<div class="rounded-xl border p-4">
				<div class="mb-1 flex items-center gap-1.5">
					<Trophy class="size-4 text-amber-500" />
					<span class="text-muted-foreground text-xs font-medium uppercase tracking-wider"
						>{m.insights_streak_longest()}</span
					>
				</div>
				<div class="flex items-baseline gap-1.5">
					<span class="text-3xl font-bold tabular-nums">{streaks.longestStreak}</span>
					<span class="text-muted-foreground text-sm">
						{streaks.longestStreak === 1 ? m.streaks_day() : m.streaks_days_unit()}
					</span>
				</div>
			</div>
		</div>

		<div>
			<p class="text-muted-foreground mb-2 text-xs font-medium">
				{m.insights_streak_last_28_days()}
			</p>
			<div class="grid gap-1" style="grid-template-columns: repeat(14, minmax(0, 1fr))">
				{#each recentDates as date (date)}
					{@const hasEntry = days[date]?.hasEntries ?? false}
					{@const isToday = date === today()}
					<div
						class="aspect-square rounded-sm {hasEntry
							? 'bg-orange-400/80 dark:bg-orange-500/70'
							: 'bg-muted/40'} {isToday ? 'ring-1 ring-orange-500 ring-offset-1' : ''}"
						title={date}
					></div>
				{/each}
			</div>
			<div class="mt-2 flex items-center justify-end gap-3 text-xs text-muted-foreground">
				<div class="flex items-center gap-1">
					<div class="h-2.5 w-2.5 rounded-sm bg-orange-400/80 dark:bg-orange-500/70"></div>
					<span>{m.insights_streak_logged()}</span>
				</div>
				<div class="flex items-center gap-1">
					<div class="h-2.5 w-2.5 rounded-sm bg-muted/40"></div>
					<span>{m.insights_streak_missed()}</span>
				</div>
			</div>
		</div>
	</div>
{/if}
