<script lang="ts">
	import DayLog from '$lib/components/entries/DayLog.svelte';
	import MacroSummaryCard from '$lib/components/entries/MacroSummaryCard.svelte';
	import DailyMacroChart from '$lib/components/charts/DailyMacroChart.svelte';
	import GoalProgressRings from '$lib/components/charts/GoalProgressRings.svelte';
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import DateNavigator from '$lib/components/entries/DateNavigator.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { type MacroTotals } from '$lib/utils/nutrition';
	import { today } from '$lib/utils/dates';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import SupplementChecklist from '$lib/components/supplements/SupplementChecklist.svelte';
	import FavoritesWidget from '$lib/components/favorites/FavoritesWidget.svelte';
	import WeightWidget from '$lib/components/weight/WeightWidget.svelte';
	import StreakWidget from '$lib/components/dashboard/StreakWidget.svelte';
	import MealBreakdownWidget from '$lib/components/dashboard/MealBreakdownWidget.svelte';
	import TopFoodsWidget from '$lib/components/dashboard/TopFoodsWidget.svelte';
	import SleepWidget from '$lib/components/dashboard/SleepWidget.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { goalsService } from '$lib/services/goals-service.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import { weightService } from '$lib/services/weight-service.svelte';
	import { supplementService } from '$lib/services/supplement-service.svelte';
	import { statsService } from '$lib/services/stats-service.svelte';
	import { entryService } from '$lib/services/entry-service.svelte';
	import { sleepService } from '$lib/services/sleep-service.svelte';
	import * as m from '$lib/paraglide/messages';
	import { ScanBarcode } from '@lucide/svelte';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
	import Target from '@lucide/svelte/icons/target';

	let { data } = $props();
	const activeDate = $derived(data.date);

	const goalsQuery = useLiveQuery(() => goalsService.goals(), undefined);
	const prefsQuery = useLiveQuery(() => preferencesService.preferences(), undefined);
	const latestWeightQuery = useLiveQuery(() => weightService.latest(), undefined);
	const checklistQuery = useLiveQuery(() => supplementService.checklist(activeDate), []);

	let userGoals = $derived(goalsQuery.value ?? null);
	let userPrefs = $derived(prefsQuery.value ?? null);
	let latestWeight = $derived(latestWeightQuery.value ?? null);
	let supplementChecklist = $derived(checklistQuery.value);

	let streaks: { currentStreak: number; longestStreak: number } | null = $state(null);
	let ready = $state(false);
	let isLg = $state(false);
	let mqlCleanup: (() => void) | undefined;
	let daylogTotals: MacroTotals = $state({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
	let scanModalOpen = $state(false);
	let addModalOpen = $state(false);

	const isToday = $derived(activeDate === today());
	const order = $derived(
		userPrefs?.widgetOrder ?? ['chart', 'streaks', 'favorites', 'supplements', 'weight', 'daylog']
	);

	const SIDEBAR_WIDGETS = new Set(['streaks', 'favorites', 'sleep', 'supplements', 'weight']);
	const mainOrder = $derived(order.filter((k) => !SIDEBAR_WIDGETS.has(k)));
	const sidebarOrder = $derived(order.filter((k) => SIDEBAR_WIDGETS.has(k)));

	const toggleSupplement = async (supplementId: string, taken: boolean) => {
		if (taken) {
			await supplementService.log(supplementId, activeDate);
		} else {
			await supplementService.unlog(supplementId, activeDate);
		}
	};

	const loadStreaks = async () => {
		const data = await statsService.getStreaks();
		if (data) streaks = data;
	};

	onMount(async () => {
		// Check start page preference from cache
		const prefs = prefsQuery.value;
		if (prefs?.startPage === 'favorites') {
			goto('/favorites', { replaceState: true });
			return;
		}
		ready = true;

		const mql = window.matchMedia('(min-width: 1024px)');
		isLg = mql.matches;
		const mqlHandler = (e: MediaQueryListEvent) => {
			isLg = e.matches;
		};
		mql.addEventListener('change', mqlHandler);
		mqlCleanup = () => mql.removeEventListener('change', mqlHandler);

		// Fire background refreshes
		goalsService.refresh();
		preferencesService.refresh();
		weightService.refresh();
		supplementService.refreshChecklist(activeDate);
		loadStreaks();
		sleepService.refresh();

		// Handle PWA shortcut query params
		const params = new URLSearchParams(window.location.search);
		if (params.get('scan') === 'true') {
			scanModalOpen = true;
			goto('/home', { replaceState: true });
		} else if (params.get('add') === 'true') {
			addModalOpen = true;
			goto('/home', { replaceState: true });
		}
	});

	onDestroy(() => mqlCleanup?.());

	// Re-check startPage once preferences load from network
	$effect(() => {
		const prefs = prefsQuery.value;
		if (prefs?.startPage === 'favorites' && !ready) {
			goto('/favorites', { replaceState: true });
		}
		if (prefs && !ready) ready = true;
	});

	// Refresh supplement checklist when date changes
	$effect(() => {
		supplementService.refreshChecklist(activeDate);
	});
</script>

{#snippet widget(sectionKey: string)}
	{#if sectionKey === 'chart' && (userPrefs?.showChartWidget ?? true)}
		{#if userGoals}
			<DashboardCard title={m.dashboard_goal_progress()} Icon={Target} tone="primary">
				<GoalProgressRings totals={daylogTotals} goals={userGoals} />
			</DashboardCard>
		{:else}
			<DashboardCard title={m.dashboard_summary()} Icon={ChartPie} tone="tertiary">
				<div class="h-[200px] sm:h-[220px]">
					<DailyMacroChart totals={daylogTotals} />
				</div>
			</DashboardCard>
		{/if}
	{:else if sectionKey === 'streaks' && streaks}
		<StreakWidget currentStreak={streaks.currentStreak} longestStreak={streaks.longestStreak} />
	{:else if sectionKey === 'weight' && isToday && userPrefs?.showWeightWidget}
		<WeightWidget
			weightKg={latestWeight?.weightKg ?? null}
			entryDate={latestWeight?.entryDate ?? null}
		/>
	{:else if sectionKey === 'supplements' && userPrefs?.showSupplementsWidget}
		<SupplementChecklist checklist={supplementChecklist} onToggle={toggleSupplement} />
	{:else if sectionKey === 'favorites' && isToday && userPrefs?.showFavoritesWidget}
		<FavoritesWidget
			onEntryLogged={() => entryService.refresh(activeDate)}
			favoriteTapAction={(userPrefs?.favoriteTapAction ?? 'instant') as 'instant' | 'picker'}
			favoriteMealAssignmentMode={(userPrefs?.favoriteMealAssignmentMode ?? 'time_based') as
				| 'time_based'
				| 'ask_meal'}
			favoriteMealTimeframes={userPrefs?.favoriteMealTimeframes ?? []}
		/>
	{:else if sectionKey === 'meal-breakdown' && userPrefs?.showMealBreakdownWidget}
		<MealBreakdownWidget date={activeDate} />
	{:else if sectionKey === 'top-foods' && isToday && userPrefs?.showTopFoodsWidget}
		<TopFoodsWidget />
	{:else if sectionKey === 'sleep' && (userPrefs?.showSleepWidget ?? true)}
		<SleepWidget date={activeDate} />
	{:else if sectionKey === 'summary'}
		<MacroSummaryCard totals={daylogTotals} />
	{:else if sectionKey === 'daylog'}
		<DayLog
			date={activeDate}
			dashboardStyle={true}
			onTotalsChange={(t) => (daylogTotals = t)}
			bind:scanModalOpen
			bind:addModalOpen
		/>
	{/if}
{/snippet}

{#if ready}
	<div>
		<div class="flex min-w-0 items-start justify-between gap-2">
			<DateNavigator date={activeDate} />
			<Button
				variant="outline"
				size="sm"
				class="hidden md:inline-flex"
				onclick={() => (scanModalOpen = true)}
			>
				<ScanBarcode class="h-4 w-4" />
				{m.dashboard_scan()}
			</Button>
		</div>

		<!-- Mobile FAB for barcode scanner -->
		<button
			type="button"
			class="fixed bottom-6 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 md:hidden"
			onclick={() => (scanModalOpen = true)}
			aria-label={m.dashboard_scan()}
		>
			<ScanBarcode class="size-6" />
		</button>

		{#if isLg}
			<!-- Desktop: main + sidebar -->
			<div class="mt-5 flex gap-6">
				<div class="min-w-0 flex-1 space-y-5">
					{#each mainOrder as key (key)}
						{@render widget(key)}
					{/each}
				</div>
				<div class="w-[340px] shrink-0 space-y-4">
					{#each sidebarOrder as key (key)}
						{@render widget(key)}
					{/each}
				</div>
			</div>
		{:else}
			<!-- Mobile: single column -->
			<div class="mt-5 space-y-4">
				{#each order as key (key)}
					{@render widget(key)}
				{/each}
			</div>
		{/if}
	</div>
{/if}
