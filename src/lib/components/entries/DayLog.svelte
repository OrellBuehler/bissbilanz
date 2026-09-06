<script lang="ts">
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import AddFoodModal from '$lib/components/entries/AddFoodModal.svelte';
	import EditEntryModal from '$lib/components/entries/EditEntryModal.svelte';
	import BarcodeScanModal from '$lib/components/barcode/BarcodeScanModal.svelte';
	import { sumEntries, type MacroTotals } from '$lib/utils/nutrition';
	import { DEFAULT_MEAL_TYPES, getCurrentMealByTime } from '$lib/utils/meals';
	import { goto } from '$app/navigation';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { api } from '$lib/api/client';
	import { entryService } from '$lib/services/entry-service.svelte';
	import { foodService } from '$lib/services/food-service.svelte';
	import { recipeService } from '$lib/services/recipe-service.svelte';
	import { dayPropertiesService } from '$lib/services/day-properties-service.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
	import Timer from '@lucide/svelte/icons/timer';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { fastingService } from '$lib/services/fasting-service.svelte';
	import { deviceTimeZone } from '$lib/analytics/local-time';
	import { formatTime } from '$lib/utils/dates';
	import { fastsOnDate, formatDuration } from '$lib/utils/fasting';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		date: string;
		dashboardStyle?: boolean;
		onTotalsChange?: (totals: MacroTotals) => void;
		scanModalOpen?: boolean;
		addModalOpen?: boolean;
	};

	let {
		date,
		dashboardStyle = false,
		onTotalsChange,
		scanModalOpen = $bindable(false),
		addModalOpen = $bindable(false)
	}: Props = $props();

	const entriesQuery = useLiveQuery(() => entryService.entriesByDate(date), []);
	const fastsQuery = useLiveQuery(() => fastingService.sessions(), []);
	const foodsQuery = useLiveQuery(() => foodService.allFoods(), []);
	const recipesQuery = useLiveQuery(() => recipeService.allRecipes(), []);

	let entries = $derived(entriesQuery.value);
	let foods = $derived(foodsQuery.value);
	let recipes = $derived(recipesQuery.value);

	let editModalOpen = $state(false);
	let activeMeal = $state(getCurrentMealByTime());
	let editingEntry: {
		id: string;
		servings: number;
		mealType: string;
		foodName?: string;
		servingSize?: number | null;
		servingUnit?: string | null;
		calories?: number | null;
		eatenAt?: string | null;
		quickCalories?: number | null;
		quickProtein?: number | null;
		quickCarbs?: number | null;
		quickFat?: number | null;
		quickFiber?: number | null;
		quickNutrients?: Record<string, number> | null;
		quickName?: string | null;
	} | null = $state(null);

	let pendingBarcodeAction: (() => void) | null = $state(null);
	let barcodeFoodId: string | null = $state(null);
	let isFastingDay = $state(false);
	let fastingLoading = $state(false);

	// Fire background refreshes
	$effect(() => {
		entryService.refresh(date);
		loadFastingDay(date);
	});
	$effect(() => {
		foodService.refresh();
		recipeService.refresh();
		fastingService.refresh();
	});

	const fastsToday = $derived(fastsOnDate(fastsQuery.value, date, deviceTimeZone()));

	async function loadFastingDay(d: string) {
		const cached = await dayPropertiesService.get(d);
		if (d !== date) return;
		isFastingDay = cached?.isFastingDay ?? false;
		const refreshed = await dayPropertiesService.refresh(d);
		if (d !== date) return;
		isFastingDay = refreshed?.isFastingDay ?? false;
	}

	async function toggleFastingDay() {
		fastingLoading = true;
		const newValue = !isFastingDay;
		isFastingDay = newValue;
		const success = await dayPropertiesService.setFastingDay(date, newValue);
		if (!success) isFastingDay = !newValue;
		fastingLoading = false;
	}

	const addEntry = async (payload: any) => {
		await entryService.create({ ...payload, date });
		addModalOpen = false;
	};

	const updateEntry = async (payload: {
		id: string;
		servings: number;
		mealType: string;
		eatenAt?: string;
		quickName?: string | null;
		quickCalories?: number | null;
		quickProtein?: number | null;
		quickCarbs?: number | null;
		quickFat?: number | null;
		quickFiber?: number | null;
		quickNutrients?: Record<string, number> | null;
	}) => {
		const { id, ...body } = payload;
		await entryService.update(id, body);
		editModalOpen = false;
		editingEntry = null;
	};

	const deleteEntry = async (id: string) => {
		await entryService.delete(id);
		editModalOpen = false;
		editingEntry = null;
	};

	const openEditModal = (entry: {
		id: string;
		servings: number;
		mealType: string;
		foodName?: string;
		servingSize?: number | null;
		servingUnit?: string | null;
		calories?: number | null;
		eatenAt?: string | null;
		quickCalories?: number | null;
		quickProtein?: number | null;
		quickCarbs?: number | null;
		quickFat?: number | null;
		quickFiber?: number | null;
		quickNutrients?: Record<string, number> | null;
		quickName?: string | null;
	}) => {
		editingEntry = entry;
		editModalOpen = true;
	};

	const handleBarcodeScan = (barcode: string) => {
		pendingBarcodeAction = async () => {
			const food = await foodService.findByBarcode(barcode);
			if (food) {
				barcodeFoodId = food.id;
				addModalOpen = true;
				return;
			}
			try {
				const { data } = await api.GET('/api/catalog/barcode/{code}', {
					params: { path: { code: barcode } }
				});
				if (data?.found && data.result) {
					const saved = await foodService.saveFromCatalog((data.result as { id: string }).id);
					if (saved) {
						barcodeFoodId = saved.id;
						addModalOpen = true;
						return;
					}
				}
			} catch {
				// fall through to OFF prefill
			}
			goto(`/foods?barcode=${encodeURIComponent(barcode)}`);
		};
	};

	const prefsQuery = useLiveQuery(() => preferencesService.preferences(), undefined);
	const userPrefs = $derived(prefsQuery.value);

	const totals = $derived(sumEntries(entries));

	const mealTypes = $derived.by(() => {
		const custom = entries
			.map((e: { mealType: string }) => e.mealType)
			.filter((mt: string) => !(DEFAULT_MEAL_TYPES as readonly string[]).includes(mt));
		const all = [...DEFAULT_MEAL_TYPES, ...new Set(custom)] as string[];
		const order = userPrefs?.mealOrder;
		if (!order || order.length === 0) return all;
		const orderIndex = new Map(order.map((name: string, i: number) => [name, i]));
		return all.sort((a, b) => {
			const ai = orderIndex.get(a) ?? Infinity;
			const bi = orderIndex.get(b) ?? Infinity;
			return ai - bi;
		});
	});

	$effect(() => {
		onTotalsChange?.(totals);
	});
</script>

<div class="space-y-4">
	{#each fastsToday as fast (fast.id)}
		<a
			href="/fasting"
			class="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50"
		>
			<div class="flex min-w-0 items-center gap-2">
				<Timer class="size-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
				<span class="truncate text-sm">
					<span class="font-medium">
						{m.day_log_fasted({
							duration: formatDuration(Date.parse(fast.endedAt) - Date.parse(fast.startedAt))
						})}
					</span>
					<span class="text-muted-foreground tabular-nums">
						· {formatTime(fast.startedAt)} – {formatTime(fast.endedAt)}
					</span>
				</span>
			</div>
			<ChevronRight class="size-4 shrink-0 text-muted-foreground" />
		</a>
	{/each}

	{#if !totals.calories}
		<div
			class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5"
		>
			<div class="flex items-center gap-2">
				<UtensilsCrossed class="size-4 text-muted-foreground" />
				<div>
					<span class="text-sm font-medium">{m.fasting_day()}</span>
					<p class="text-xs text-muted-foreground">{m.fasting_day_description()}</p>
					<a href="/fasting" class="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
						{m.day_log_fasting_open()}
					</a>
				</div>
			</div>
			<Switch checked={isFastingDay} onCheckedChange={toggleFastingDay} disabled={fastingLoading} />
		</div>
	{/if}

	<div class="grid gap-4">
		{#each mealTypes as mealType}
			<MealSection
				title={mealType}
				{dashboardStyle}
				entries={entries.filter((e) => e.mealType === mealType)}
				onAdd={() => {
					addModalOpen = true;
					activeMeal = mealType;
				}}
				onEdit={openEditModal}
				onDelete={deleteEntry}
			/>
		{/each}
	</div>

	<AddFoodModal
		bind:open={addModalOpen}
		{foods}
		{recipes}
		{date}
		mealType={activeMeal}
		initialFoodId={barcodeFoodId}
		onClose={() => {
			addModalOpen = false;
			barcodeFoodId = null;
		}}
		onSave={addEntry}
	/>
	<EditEntryModal
		bind:open={editModalOpen}
		{date}
		entry={editingEntry}
		onClose={() => {
			editModalOpen = false;
			editingEntry = null;
		}}
		onSave={updateEntry}
		onDelete={deleteEntry}
	/>
	<BarcodeScanModal
		bind:open={scanModalOpen}
		onClose={() => (scanModalOpen = false)}
		onBarcode={handleBarcodeScan}
		onClosed={() => {
			if (pendingBarcodeAction) {
				const action = pendingBarcodeAction;
				pendingBarcodeAction = null;
				action();
			}
		}}
	/>
</div>
