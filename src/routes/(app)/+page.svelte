<script lang="ts">
	import DayLog from '$lib/components/entries/DayLog.svelte';
	import MacroSummaryCard from '$lib/components/entries/MacroSummaryCard.svelte';
	import DailyMacroChart from '$lib/components/charts/DailyMacroChart.svelte';
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { type MacroTotals } from '$lib/utils/nutrition';
	import { today, yesterday, shiftDate } from '$lib/utils/dates';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/utils/api';
	import SupplementChecklist from '$lib/components/supplements/SupplementChecklist.svelte';
	import FavoritesWidget from '$lib/components/favorites/FavoritesWidget.svelte';
	import WeightWidget from '$lib/components/weight/WeightWidget.svelte';
	import MealBreakdownWidget from '$lib/components/dashboard/MealBreakdownWidget.svelte';
	import * as m from '$lib/paraglide/messages';
	import { ChevronLeft, ChevronRight, ScanBarcode } from '@lucide/svelte';
	import ChartPie from '@lucide/svelte/icons/chart-pie';

	let activeDate = $state(today());

	let refreshKey = $state(0);
	type ChecklistItem = {
		supplement: {
			id: string;
			name: string;
			dosage: number;
			dosageUnit: string;
			timeOfDay: string | null;
		};
		taken: boolean;
		takenAt: string | null;
	};
	let supplementChecklist: ChecklistItem[] = $state([]);
	let latestWeight: { weightKg: number; entryDate: string } | null = $state(null);
	let userPrefs: Record<string, any> | null = $state(null);
	let ready = $state(false);
	let daylogTotals: MacroTotals = $state({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
	let scanModalOpen = $state(false);

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

		loadSupplements();
		loadLatestWeight();
	};

	onMount(() => {
		checkStartPage();

		const onSynced = () => {
			refreshKey++;
			loadSupplements();
			loadLatestWeight();
		};
		window.addEventListener('queue-synced', onSynced);
		return () => window.removeEventListener('queue-synced', onSynced);
	});
</script>

{#if ready}
	<div class="mx-auto max-w-4xl space-y-6">
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					onclick={prevDay}
					aria-label={m.dashboard_previous_day()}
				>
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
			<Button variant="outline" size="sm" onclick={() => (scanModalOpen = true)}>
				<ScanBarcode class="h-4 w-4" />
				{m.dashboard_scan()}
			</Button>
		</div>

		{#each userPrefs?.widgetOrder ?? ['chart', 'favorites', 'supplements', 'weight', 'daylog'] as sectionKey (sectionKey)}
			{#if sectionKey === 'chart'}
				<DashboardCard title={m.dashboard_summary()} Icon={ChartPie} tone="violet">
					<div class="h-[200px] sm:h-[220px]">
						<DailyMacroChart totals={daylogTotals} />
					</div>
				</DashboardCard>
			{:else if sectionKey === 'favorites' && isToday && userPrefs?.showFavoritesWidget}
				<FavoritesWidget
					onEntryLogged={() => refreshKey++}
					favoriteTapAction={userPrefs?.favoriteTapAction ?? 'instant'}
					favoriteMealAssignmentMode={userPrefs?.favoriteMealAssignmentMode ?? 'time_based'}
					favoriteMealTimeframes={userPrefs?.favoriteMealTimeframes ?? []}
				/>
			{:else if sectionKey === 'supplements' && isToday && userPrefs?.showSupplementsWidget}
				<SupplementChecklist checklist={supplementChecklist} onToggle={toggleSupplement} />
			{:else if sectionKey === 'weight' && isToday && userPrefs?.showWeightWidget}
				<WeightWidget
					weightKg={latestWeight?.weightKg ?? null}
					entryDate={latestWeight?.entryDate ?? null}
				/>
			{:else if sectionKey === 'meal-breakdown' && userPrefs?.showMealBreakdownWidget}
				<MealBreakdownWidget date={activeDate} />
			{:else if sectionKey === 'summary'}
				<MacroSummaryCard totals={daylogTotals} />
			{:else if sectionKey === 'daylog'}
				<DayLog
					date={activeDate}
					{refreshKey}
					dashboardStyle={true}
					onTotalsChange={(t) => (daylogTotals = t)}
					bind:scanModalOpen
				/>
			{/if}
		{/each}
	</div>
{/if}
