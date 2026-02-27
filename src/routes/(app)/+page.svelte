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
	import { apiFetch } from '$lib/utils/api';
	import SupplementChecklist from '$lib/components/supplements/SupplementChecklist.svelte';
	import FavoritesWidget from '$lib/components/favorites/FavoritesWidget.svelte';
	import WeightWidget from '$lib/components/weight/WeightWidget.svelte';
	import * as m from '$lib/paraglide/messages';
	import { ScanBarcode } from '@lucide/svelte';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
	import Target from '@lucide/svelte/icons/target';

	let { data } = $props();
	const activeDate = $derived(data.date);

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
	let userGoals: {
		calorieGoal: number;
		proteinGoal: number;
		carbGoal: number;
		fatGoal: number;
		fiberGoal: number;
	} | null = $state(null);

	const isToday = $derived(activeDate === today());

	$effect(() => {
		if (ready) loadSupplements(activeDate);
	});

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

	const loadSupplements = async (date: string = activeDate) => {
		try {
			const res = await fetch(`/api/supplements/${date}/checklist`);
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
				body: JSON.stringify({ date: activeDate })
			});
		} else {
			await apiFetch(`/api/supplements/${supplementId}/log/${activeDate}`, { method: 'DELETE' });
		}
		await loadSupplements(activeDate);
	};

	const loadGoals = async () => {
		try {
			const res = await fetch('/api/goals');
			if (res.ok) {
				const data = await res.json();
				userGoals = data.goals;
			}
		} catch {
			// silently ignore
		}
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

		loadLatestWeight();
		loadGoals();
	};

	onMount(() => {
		checkStartPage();

		const onSynced = () => {
			refreshKey++;
			loadSupplements(activeDate);
			loadLatestWeight();
		};
		window.addEventListener('queue-synced', onSynced);
		return () => window.removeEventListener('queue-synced', onSynced);
	});
</script>

{#if ready}
	<div class="mx-auto max-w-4xl space-y-6">
		<div class="flex items-center justify-between gap-2">
			<DateNavigator date={activeDate} />
			<Button variant="outline" size="sm" onclick={() => (scanModalOpen = true)}>
				<ScanBarcode class="h-4 w-4" />
				{m.dashboard_scan()}
			</Button>
		</div>

		{#each userPrefs?.widgetOrder ?? ['chart', 'favorites', 'supplements', 'weight', 'daylog'] as sectionKey (sectionKey)}
			{#if sectionKey === 'chart' && (userPrefs?.showChartWidget ?? true)}
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
			{:else if sectionKey === 'favorites' && isToday && userPrefs?.showFavoritesWidget}
				<FavoritesWidget
					onEntryLogged={() => refreshKey++}
					favoriteTapAction={userPrefs?.favoriteTapAction ?? 'instant'}
					favoriteMealAssignmentMode={userPrefs?.favoriteMealAssignmentMode ?? 'time_based'}
					favoriteMealTimeframes={userPrefs?.favoriteMealTimeframes ?? []}
				/>
			{:else if sectionKey === 'supplements' && userPrefs?.showSupplementsWidget}
				<SupplementChecklist checklist={supplementChecklist} onToggle={toggleSupplement} />
			{:else if sectionKey === 'weight' && isToday && userPrefs?.showWeightWidget}
				<WeightWidget
					weightKg={latestWeight?.weightKg ?? null}
					entryDate={latestWeight?.entryDate ?? null}
				/>
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
