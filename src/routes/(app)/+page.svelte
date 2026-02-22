<script lang="ts">
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import AddFoodModal from '$lib/components/entries/AddFoodModal.svelte';
	import EditEntryModal from '$lib/components/entries/EditEntryModal.svelte';
	import BarcodeScanModal from '$lib/components/barcode/BarcodeScanModal.svelte';
	import CalorieTrendChart from '$lib/components/charts/CalorieTrendChart.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { calculateDailyTotals, type MacroTotals } from '$lib/utils/nutrition';
	import { progressColor } from '$lib/utils/progress';
	import { today, yesterday, daysAgo } from '$lib/utils/dates';
	import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/utils/api';
	import SupplementChecklist from '$lib/components/supplements/SupplementChecklist.svelte';
	import FavoritesWidget from '$lib/components/favorites/FavoritesWidget.svelte';
	import WeightWidget from '$lib/components/weight/WeightWidget.svelte';
	import * as m from '$lib/paraglide/messages';

	let foods: Array<any> = $state([]);
	let recipes: Array<any> = $state([]);
	let entries: Array<any> = $state([]);
	let addModalOpen = $state(false);
	let editModalOpen = $state(false);
	let scanModalOpen = $state(false);
	let activeMeal = $state('Breakfast');
	let editingEntry: { id: string; servings: number; mealType: string; foodName?: string } | null =
		$state(null);
	let copying = $state(false);
	let scannedFood: any = $state(null);
	let scannedBarcode = $state('');
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

	const currentDate = today();

	const loadData = async () => {
		const [foodsRes, recipesRes, entriesRes] = await Promise.all([
			fetch('/api/foods'),
			fetch('/api/recipes'),
			fetch(`/api/entries?date=${currentDate}`)
		]);
		foods = (await foodsRes.json()).foods;
		recipes = (await recipesRes.json()).recipes;
		entries = (await entriesRes.json()).entries;
	};

	const addEntry = async (payload: any) => {
		await apiFetch('/api/entries', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...payload, date: currentDate })
		});
		addModalOpen = false;
		scannedFood = null;
		await Promise.all([loadData(), loadWeeklyChart()]);
	};

	const updateEntry = async (payload: { id: string; servings: number; mealType: string }) => {
		await apiFetch(`/api/entries/${payload.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ servings: payload.servings, mealType: payload.mealType })
		});
		editModalOpen = false;
		editingEntry = null;
		await Promise.all([loadData(), loadWeeklyChart()]);
	};

	const deleteEntry = async (id: string) => {
		await apiFetch(`/api/entries/${id}`, { method: 'DELETE' });
		editModalOpen = false;
		editingEntry = null;
		await Promise.all([loadData(), loadWeeklyChart()]);
	};

	const openEditModal = (entry: {
		id: string;
		servings: number;
		mealType: string;
		foodName?: string;
	}) => {
		editingEntry = entry;
		editModalOpen = true;
	};

	const copyYesterday = async () => {
		copying = true;
		try {
			await apiFetch(`/api/entries/copy?fromDate=${yesterday()}&toDate=${currentDate}`, {
				method: 'POST'
			});
			await Promise.all([loadData(), loadWeeklyChart()]);
		} finally {
			copying = false;
		}
	};

	const handleBarcodeScan = async (barcode: string) => {
		const res = await fetch(`/api/foods?barcode=${encodeURIComponent(barcode)}`);
		const data = await res.json();
		if (data.food) {
			scannedFood = data.food;
			scannedBarcode = barcode;
			addModalOpen = true;
		} else {
			goto(`/foods/new?barcode=${encodeURIComponent(barcode)}`);
		}
	};

	const totals = $derived(calculateDailyTotals(entries));

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

		loadData();
		loadWeeklyChart();
		loadSupplements();
		loadLatestWeight();
	};

	onMount(() => {
		checkStartPage();
	});
</script>

{#if ready}
<div class="mx-auto max-w-4xl space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-2xl font-semibold">{m.dashboard_today()}</h2>
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={() => (scanModalOpen = true)}>
				{m.dashboard_scan()}
			</Button>
			<Button variant="outline" size="sm" onclick={copyYesterday} disabled={copying}>
				{copying ? m.dashboard_copying() : m.dashboard_copy_yesterday()}
			</Button>
		</div>
	</div>
	<div class={`text-lg font-medium ${progressColor(totals.calories, weeklyCalorieGoal ?? 2000)}`}>
		{m.dashboard_kcal({ value: Math.round(totals.calories), goal: weeklyCalorieGoal ?? 2000 })}
	</div>
	{#if weeklyData.length > 0}
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
	{/if}
	{#each userPrefs?.widgetOrder ?? ['favorites', 'supplements', 'weight'] as widgetKey (widgetKey)}
		{#if widgetKey === 'favorites' && userPrefs?.showFavoritesWidget}
			<FavoritesWidget onEntryLogged={loadData} favoriteTapAction={userPrefs?.favoriteTapAction ?? 'instant'} />
		{:else if widgetKey === 'supplements' && userPrefs?.showSupplementsWidget}
			<SupplementChecklist checklist={supplementChecklist} onToggle={toggleSupplement} />
		{:else if widgetKey === 'weight' && userPrefs?.showWeightWidget}
			<WeightWidget weightKg={latestWeight?.weightKg ?? null} entryDate={latestWeight?.entryDate ?? null} />
		{/if}
	{/each}
	<div class="grid gap-4">
		{#each DEFAULT_MEAL_TYPES as mealType}
			<MealSection
				title={mealType}
				entries={entries.filter((e) => e.mealType === mealType)}
				onAdd={() => {
					addModalOpen = true;
					activeMeal = mealType;
				}}
				onEdit={openEditModal}
			/>
		{/each}
	</div>
	<AddFoodModal
		open={addModalOpen}
		{foods}
		{recipes}
		mealType={activeMeal}
		onClose={() => {
			addModalOpen = false;
			scannedFood = null;
		}}
		onSave={addEntry}
	/>
	<EditEntryModal
		open={editModalOpen}
		entry={editingEntry}
		onClose={() => {
			editModalOpen = false;
			editingEntry = null;
		}}
		onSave={updateEntry}
		onDelete={deleteEntry}
	/>
	<BarcodeScanModal
		open={scanModalOpen}
		onClose={() => (scanModalOpen = false)}
		onBarcode={handleBarcodeScan}
	/>
</div>
{/if}
