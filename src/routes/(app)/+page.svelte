<script lang="ts">
	import DayLog from '$lib/components/entries/DayLog.svelte';
	import CalorieTrendChart from '$lib/components/charts/CalorieTrendChart.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { type MacroTotals } from '$lib/utils/nutrition';
	import { today, yesterday, daysAgo, shiftDate } from '$lib/utils/dates';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/utils/api';
	import SupplementChecklist from '$lib/components/supplements/SupplementChecklist.svelte';
	import FavoritesWidget from '$lib/components/favorites/FavoritesWidget.svelte';
	import WeightWidget from '$lib/components/weight/WeightWidget.svelte';
	import * as m from '$lib/paraglide/messages';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';

	let activeDate = $state(today());
	let copying = $state(false);
	let refreshKey = $state(0);
	let weeklyData: Array<{ date: string } & MacroTotals> = $state([]);
	let weeklyCalorieGoal: number | undefined = $state(undefined);
	type ChecklistItem = {
		supplement: { id: string; name: string; dosage: number; dosageUnit: string; timeOfDay: string | null };
		taken: boolean;
		takenAt: string | null;
	};
	let supplementChecklist: ChecklistItem[] = $state([]);
	let latestWeight: { weightKg: number; entryDate: string } | null = $state(null);
	let userPrefs: Record<string, any> | null = $state(null);
	let ready = $state(false);

	const isToday = $derived(activeDate === today());

	const dateLabel = $derived(
		activeDate === today()
			? m.dashboard_today()
			: activeDate === yesterday()
				? m.dashboard_yesterday()
				: activeDate
	);

	const prevDay = () => {
		activeDate = shiftDate(activeDate, -1);
	};

	const nextDay = () => {
		if (!isToday) activeDate = shiftDate(activeDate, 1);
	};

	const copyYesterday = async () => {
		copying = true;
		try {
			await apiFetch(`/api/entries/copy?fromDate=${yesterday()}&toDate=${today()}`, {
				method: 'POST'
			});
			refreshKey++;
			await loadWeeklyChart();
		} finally {
			copying = false;
		}
	};

	const loadWeeklyChart = async () => {
		try {
			const res = await fetch(`/api/stats/daily?startDate=${daysAgo(7)}&endDate=${today()}`);
			if (!res.ok) return;
			const json = await res.json();
			weeklyData = json.data ?? [];
			weeklyCalorieGoal = json.goals?.calorieGoal ?? undefined;
		} catch {
			// silently ignore chart load failures
		}
	};

	const loadLatestWeight = async () => {
		try {
			const res = await fetch('/api/weight/latest');
			if (res.ok) {
				const data = await res.json();
				latestWeight = data.entry;
			}
		} catch {
			// silently ignore
		}
	};

	const loadSupplements = async () => {
		try {
			const res = await fetch('/api/supplements/today');
			if (res.ok) {
				supplementChecklist = (await res.json()).checklist;
			}
		} catch {
			// silently ignore
		}
	};

	const toggleSupplement = async (supplementId: string, taken: boolean) => {
		if (taken) {
			await apiFetch(`/api/supplements/${supplementId}/log`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}'
			});
		} else {
			const currentDate = today();
			await apiFetch(`/api/supplements/${supplementId}/log/${currentDate}`, { method: 'DELETE' });
		}
		await loadSupplements();
	};

	const checkStartPage = async () => {
		try {
			const res = await fetch('/api/preferences');
			if (res.ok) {
				const { preferences } = await res.json();
				userPrefs = preferences;
				if (preferences.startPage === 'favorites') {
					goto('/favorites', { replaceState: true });
					return;
				}
			}
		} catch {
			// Silently ignore -- show dashboard as fallback
		}
		ready = true;

		loadWeeklyChart();
		loadSupplements();
		loadLatestWeight();
	};

	onMount(() => {
		checkStartPage();

		const onSynced = () => {
			refreshKey++;
			loadWeeklyChart();
			loadSupplements();
			loadLatestWeight();
		};
		window.addEventListener('queue-synced', onSynced);
		return () => window.removeEventListener('queue-synced', onSynced);
	});
</script>

{#if ready}
<div class="mx-auto max-w-4xl space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<Button variant="ghost" size="icon" onclick={prevDay} aria-label={m.dashboard_previous_day()}>
				<ChevronLeft class="h-4 w-4" />
			</Button>
			<h2 class="text-2xl font-semibold">{dateLabel}</h2>
			<Button
				variant="ghost"
				size="icon"
				onclick={nextDay}
				disabled={isToday}
				aria-label={m.dashboard_next_day()}
			>
				<ChevronRight class="h-4 w-4" />
			</Button>
		</div>
		{#if isToday}
			<Button variant="outline" size="sm" onclick={copyYesterday} disabled={copying}>
				{copying ? m.dashboard_copying() : m.dashboard_copy_yesterday()}
			</Button>
		{/if}
	</div>

	{#each userPrefs?.widgetOrder ?? ['chart', 'favorites', 'supplements', 'weight', 'daylog'] as sectionKey (sectionKey)}
		{#if sectionKey === 'chart' && weeklyData.length > 0}
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-base">{m.charts_this_week()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="h-[200px]">
						<CalorieTrendChart data={weeklyData} calorieGoal={weeklyCalorieGoal} />
					</div>
				</Card.Content>
			</Card.Root>
		{:else if sectionKey === 'favorites' && isToday && userPrefs?.showFavoritesWidget}
			<FavoritesWidget onEntryLogged={() => refreshKey++} favoriteTapAction={userPrefs?.favoriteTapAction ?? 'instant'} />
		{:else if sectionKey === 'supplements' && isToday && userPrefs?.showSupplementsWidget}
			<SupplementChecklist checklist={supplementChecklist} onToggle={toggleSupplement} />
		{:else if sectionKey === 'weight' && isToday && userPrefs?.showWeightWidget}
			<WeightWidget weightKg={latestWeight?.weightKg ?? null} entryDate={latestWeight?.entryDate ?? null} />
		{:else if sectionKey === 'daylog'}
			<DayLog date={activeDate} {refreshKey} onMutation={loadWeeklyChart} />
		{/if}
	{/each}
</div>
{/if}
