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
	import { onMount } from 'svelte';
	import SupplementChecklist from '$lib/components/supplements/SupplementChecklist.svelte';
	import FavoritesWidget from '$lib/components/favorites/FavoritesWidget.svelte';
	import WeightWidget from '$lib/components/weight/WeightWidget.svelte';
	import StreakWidget from '$lib/components/dashboard/StreakWidget.svelte';
	import MealBreakdownWidget from '$lib/components/dashboard/MealBreakdownWidget.svelte';
	import TopFoodsWidget from '$lib/components/dashboard/TopFoodsWidget.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { goalsService } from '$lib/services/goals-service.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import { weightService } from '$lib/services/weight-service.svelte';
	import { supplementService } from '$lib/services/supplement-service.svelte';
	import { statsService } from '$lib/services/stats-service.svelte';
	import { entryService } from '$lib/services/entry-service.svelte';
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
	let daylogTotals: MacroTotals = $state({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
	let scanModalOpen = $state(false);
	let addModalOpen = $state(false);

	const isToday = $derived(activeDate === today());
	const order = $derived(
		userPrefs?.widgetOrder ?? ['chart', 'streaks', 'favorites', 'supplements', 'weight', 'daylog']
	);

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

		// Fire background refreshes
		goalsService.refresh();
		preferencesService.refresh();
		weightService.refresh();
		supplementService.refreshChecklist(activeDate);
		loadStreaks();

		// Handle PWA shortcut query params
		const params = new URLSearchParams(window.location.search);
		if (params.get('scan') === 'true') {
			scanModalOpen = true;
			goto('/', { replaceState: true });
		} else if (params.get('add') === 'true') {
			addModalOpen = true;
			goto('/', { replaceState: true });
		}
	});

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

{#if ready}
	<div class="mx-auto max-w-4xl">
		<div class="flex min-w-0 items-start justify-between gap-2">
			<DateNavigator date={activeDate} />
			<Button variant="outline" size="sm" onclick={() => (scanModalOpen = true)}>
				<ScanBarcode class="h-4 w-4" />
				{m.dashboard_scan()}
			</Button>
		</div>

		<!-- Hero section: chart/goals -->
		{#each order as sectionKey (sectionKey)}
			{#if sectionKey === 'chart' && (userPrefs?.showChartWidget ?? true)}
				<div class="mt-6">
					{#if userGoals}
						<DashboardCard title={m.dashboard_goal_progress()} Icon={Target} tone="blue">
							<GoalProgressRings totals={daylogTotals} goals={userGoals} />
						</DashboardCard>
					{:else}
						<DashboardCard title={m.dashboard_summary()} Icon={ChartPie} tone="violet">
							<div class="h-[200px] sm:h-[220px]">
								<DailyMacroChart totals={daylogTotals} />
							</div>
						</DashboardCard>
					{/if}
				</div>
			{/if}
		{/each}

		<!-- Compact widgets row: streak + weight side by side on sm+ -->
		{#if (order.includes('streaks') && streaks) || (order.includes('weight') && isToday && userPrefs?.showWeightWidget)}
			<div class="mt-4 grid gap-4 sm:grid-cols-2">
				{#if order.includes('streaks') && streaks}
					<StreakWidget
						currentStreak={streaks.currentStreak}
						longestStreak={streaks.longestStreak}
					/>
				{/if}
				{#if order.includes('weight') && isToday && userPrefs?.showWeightWidget}
					<WeightWidget
						weightKg={latestWeight?.weightKg ?? null}
						entryDate={latestWeight?.entryDate ?? null}
					/>
				{/if}
			</div>
		{/if}

		<!-- Supplements + Favorites + other content widgets -->
		{#each order as sectionKey (sectionKey)}
			{#if sectionKey === 'supplements' && userPrefs?.showSupplementsWidget}
				<div class="mt-4">
					<SupplementChecklist checklist={supplementChecklist} onToggle={toggleSupplement} />
				</div>
			{:else if sectionKey === 'favorites' && isToday && userPrefs?.showFavoritesWidget}
				<div class="mt-4">
					<FavoritesWidget
						onEntryLogged={() => entryService.refresh(activeDate)}
						favoriteTapAction={(userPrefs?.favoriteTapAction ?? 'instant') as 'instant' | 'picker'}
						favoriteMealAssignmentMode={(userPrefs?.favoriteMealAssignmentMode ?? 'time_based') as
							| 'time_based'
							| 'ask_meal'}
						favoriteMealTimeframes={userPrefs?.favoriteMealTimeframes ?? []}
					/>
				</div>
			{:else if sectionKey === 'meal-breakdown' && userPrefs?.showMealBreakdownWidget}
				<div class="mt-4">
					<MealBreakdownWidget date={activeDate} />
				</div>
			{:else if sectionKey === 'top-foods' && isToday && userPrefs?.showTopFoodsWidget}
				<div class="mt-4">
					<TopFoodsWidget />
				</div>
			{:else if sectionKey === 'summary'}
				<div class="mt-4">
					<MacroSummaryCard totals={daylogTotals} />
				</div>
			{/if}
		{/each}

		<!-- Day log: separated with more spacing -->
		{#if order.includes('daylog')}
			<div class="mt-8">
				<DayLog
					date={activeDate}
					dashboardStyle={true}
					onTotalsChange={(t) => (daylogTotals = t)}
					bind:scanModalOpen
					bind:addModalOpen
				/>
			</div>
		{/if}
	</div>
{/if}
