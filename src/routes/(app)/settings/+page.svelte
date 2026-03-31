<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import { SortableList, sortItems } from '@rodrigodagostino/svelte-sortable-list';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { getUser } from '$lib/stores/auth.svelte';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api/client';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import { DEFAULT_MEAL_TYPES, validateFavoriteMealTimeframes } from '$lib/utils/meals';
	import * as m from '$lib/paraglide/messages';
	import {
		ALL_NUTRIENTS,
		CATEGORY_ORDER,
		NUTRIENTS_BY_CATEGORY,
		DEFAULT_VISIBLE_NUTRIENTS,
		getNutrientLabel,
		getCategoryLabel,
		type NutrientCategory
	} from '$lib/nutrients';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';

	let mealTypes: Array<{ id: string; name: string; sortOrder: number }> = $state([]);
	let newName = $state('');

	let showChartWidget = $state(true);
	let showFavoritesWidget = $state(true);
	let showSupplementsWidget = $state(true);
	let showWeightWidget = $state(true);
	let showMealBreakdownWidget = $state(true);
	let showTopFoodsWidget = $state(true);
	let showSleepWidget = $state(true);
	let widgetOrder = $state<
		Array<{ id: string; name: () => string; desc: () => string; key: string }>
	>([]);
	let mealOrder = $state<Array<{ id: string; name: string; isDefault: boolean }>>([]);
	let startPage = $state('dashboard');
	let prefsLoaded = $state(false);
	let favoriteMealAssignmentMode = $state<'time_based' | 'ask_meal'>('time_based');
	type TimeframeDraft = {
		id: string;
		mealType: string;
		customMealTypeId: string | null;
		startTime: string;
		endTime: string;
	};
	let favoriteMealTimeframes = $state<TimeframeDraft[]>([]);
	let savingFavoriteLogging = $state(false);
	let visibleNutrients = $state<Set<string>>(new Set(DEFAULT_VISIBLE_NUTRIENTS));
	let savingNutrients = $state(false);

	const cachedPrefs = useLiveQuery(() => preferencesService.preferences(), undefined);

	$effect(() => {
		preferencesService.refresh();
	});

	$effect(() => {
		const p = cachedPrefs.value;
		if (p) {
			showChartWidget = p.showChartWidget ?? true;
			showFavoritesWidget = p.showFavoritesWidget ?? true;
			showSupplementsWidget = p.showSupplementsWidget ?? true;
			showWeightWidget = p.showWeightWidget ?? true;
			showMealBreakdownWidget = p.showMealBreakdownWidget ?? true;
			showTopFoodsWidget = p.showTopFoodsWidget ?? true;
			showSleepWidget = p.showSleepWidget ?? true;
			widgetOrder = buildWidgetOrder(
				p.widgetOrder ?? ['chart', 'favorites', 'supplements', 'weight', 'summary', 'daylog']
			);
			startPage = p.startPage ?? 'dashboard';
			favoriteMealAssignmentMode = (p.favoriteMealAssignmentMode ??
				'time_based') as typeof favoriteMealAssignmentMode;
			favoriteMealTimeframes = (p.favoriteMealTimeframes ?? []).map((row) => {
				const startH = Math.floor(row.startMinute / 60)
					.toString()
					.padStart(2, '0');
				const startM = (row.startMinute % 60).toString().padStart(2, '0');
				const endH = Math.floor(row.endMinute / 60)
					.toString()
					.padStart(2, '0');
				const endM = (row.endMinute % 60).toString().padStart(2, '0');
				return {
					id: row.id ?? crypto.randomUUID(),
					mealType: row.mealType,
					customMealTypeId: row.customMealTypeId ?? null,
					startTime: `${startH}:${startM}`,
					endTime: `${endH}:${endM}`
				};
			});
			if (p.visibleNutrients) {
				visibleNutrients = new Set(p.visibleNutrients);
			}
			buildMealOrder(p.mealOrder ?? ['Breakfast', 'Lunch', 'Dinner', 'Snacks']);
			prefsLoaded = true;
		}
	});

	const msgs = m as unknown as Record<string, (() => string) | undefined>;

	function toggleNutrient(key: string) {
		const next = new Set(visibleNutrients);
		if (next.has(key)) {
			next.delete(key);
		} else {
			next.add(key);
		}
		visibleNutrients = next;
	}

	function selectAllNutrients() {
		visibleNutrients = new Set(ALL_NUTRIENTS.map((n) => n.key));
	}

	function deselectAllNutrients() {
		visibleNutrients = new Set();
	}

	async function saveVisibleNutrients() {
		savingNutrients = true;
		try {
			const ok = await preferencesService.update({ visibleNutrients: [...visibleNutrients] });
			if (ok) {
				toast.success(m.settings_saved(), { duration: 1500 });
			} else {
				toast.error(m.settings_save_failed());
			}
		} catch {
			toast.error(m.settings_save_failed());
		} finally {
			savingNutrients = false;
		}
	}

	const WIDGET_DEFS: Record<string, { name: () => string; desc: () => string }> = {
		chart: {
			name: () => m.settings_section_chart(),
			desc: () => m.settings_section_chart_desc()
		},
		streaks: {
			name: () => m.settings_section_streaks(),
			desc: () => m.settings_section_streaks_desc()
		},
		favorites: {
			name: () => m.settings_widget_favorites(),
			desc: () => m.settings_widget_favorites_desc()
		},
		supplements: {
			name: () => m.settings_widget_supplements(),
			desc: () => m.settings_widget_supplements_desc()
		},
		weight: {
			name: () => m.settings_widget_weight(),
			desc: () => m.settings_widget_weight_desc()
		},
		'meal-breakdown': {
			name: () => m.settings_widget_meal_breakdown(),
			desc: () => m.settings_widget_meal_breakdown_desc()
		},
		'top-foods': {
			name: () => m.settings_widget_top_foods(),
			desc: () => m.settings_widget_top_foods_desc()
		},
		sleep: {
			name: () => m.settings_widget_sleep(),
			desc: () => m.settings_widget_sleep_desc()
		},
		summary: {
			name: () => m.settings_section_summary(),
			desc: () => m.settings_section_summary_desc()
		},
		daylog: {
			name: () => m.settings_section_daylog(),
			desc: () => m.settings_section_daylog_desc()
		}
	};

	const buildWidgetOrder = (order: string[]) =>
		order.map((key) => ({
			id: key,
			key,
			name: WIDGET_DEFS[key]?.name ?? (() => key),
			desc: WIDGET_DEFS[key]?.desc ?? (() => '')
		}));

	const mealTypeOptions = $derived([
		...DEFAULT_MEAL_TYPES.map((meal) => ({
			value: `default:${meal}`,
			label: meal,
			mealType: meal,
			customMealTypeId: null as string | null
		})),
		...mealTypes.map((meal) => ({
			value: `custom:${meal.id}`,
			label: meal.name,
			mealType: meal.name,
			customMealTypeId: meal.id
		}))
	]);

	const mealTypeSelectValue = (row: TimeframeDraft) =>
		row.customMealTypeId ? `custom:${row.customMealTypeId}` : `default:${row.mealType}`;

	const setRowMealSelection = (rowId: string, value: string) => {
		const selected = mealTypeOptions.find((opt) => opt.value === value);
		if (!selected) return;
		favoriteMealTimeframes = favoriteMealTimeframes.map((row) =>
			row.id === rowId
				? {
						...row,
						mealType: selected.mealType,
						customMealTypeId: selected.customMealTypeId
					}
				: row
		);
	};

	const timeframeValidation = $derived.by(() => {
		const result = validateFavoriteMealTimeframes(
			favoriteMealTimeframes.map((row) => ({
				mealType: row.mealType,
				startTime: row.startTime,
				endTime: row.endTime
			}))
		);
		if (result.valid) return { valid: true as const, message: '' };

		const messages = {
			'invalid-time': 'Use valid times in HH:mm format.',
			'invalid-range':
				'Start time must be before end time. Cross-midnight windows are not supported.',
			overlap: 'Time windows cannot overlap.',
			'missing-meal-type': 'Each timeframe must have a meal type.'
		};
		return { valid: false as const, message: messages[result.error] };
	});

	const overlappingRowIds = $derived.by(() => {
		const parsed = favoriteMealTimeframes
			.map((row) => {
				const [sh, sm] = row.startTime.split(':');
				const [eh, em] = row.endTime.split(':');
				if (!/^\d{2}:\d{2}$/.test(row.startTime) || !/^\d{2}:\d{2}$/.test(row.endTime)) {
					return null;
				}
				const start = Number(sh) * 60 + Number(sm);
				const end = Number(eh) * 60 + Number(em);
				if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null;
				return { id: row.id, start, end };
			})
			.filter(Boolean) as Array<{ id: string; start: number; end: number }>;

		const overlaps = new Set<string>();
		for (let i = 0; i < parsed.length; i++) {
			for (let j = i + 1; j < parsed.length; j++) {
				const a = parsed[i];
				const b = parsed[j];
				if (a && b && a.start < b.end && b.start < a.end) {
					overlaps.add(a.id);
					overlaps.add(b.id);
				}
			}
		}
		return overlaps;
	});

	const referencedCustomMealTypeIds = $derived(
		new Set(favoriteMealTimeframes.map((row) => row.customMealTypeId).filter(Boolean) as string[])
	);

	const createTimeframeRow = (): TimeframeDraft => ({
		id: crypto.randomUUID(),
		mealType: 'Breakfast',
		customMealTypeId: null,
		startTime: '08:00',
		endTime: '10:00'
	});

	const addFavoriteMealTimeframe = () => {
		favoriteMealTimeframes = [...favoriteMealTimeframes, createTimeframeRow()];
	};

	const updateFavoriteMealTimeframe = (rowId: string, patch: Partial<TimeframeDraft>) => {
		favoriteMealTimeframes = favoriteMealTimeframes.map((row) =>
			row.id === rowId ? { ...row, ...patch } : row
		);
	};

	const removeFavoriteMealTimeframe = (rowId: string) => {
		favoriteMealTimeframes = favoriteMealTimeframes.filter((row) => row.id !== rowId);
	};

	const saveFavoriteLoggingConfig = async () => {
		if (!timeframeValidation.valid) return;
		savingFavoriteLogging = true;
		try {
			const ok = await preferencesService.update({
				favoriteMealAssignmentMode,
				favoriteMealTimeframes: favoriteMealTimeframes.map((row) => ({
					mealType: row.mealType,
					customMealTypeId: row.customMealTypeId,
					startTime: row.startTime,
					endTime: row.endTime
				}))
			});
			if (ok) {
				toast.success(m.settings_saved(), { duration: 1500 });
			} else {
				toast.error(m.settings_save_failed());
			}
		} catch {
			toast.error(m.settings_save_failed());
		} finally {
			savingFavoriteLogging = false;
		}
	};

	const savePreference = async (key: string, value: unknown) => {
		try {
			const ok = await preferencesService.update({ [key]: value } as Parameters<
				typeof preferencesService.update
			>[0]);
			if (ok) {
				toast.success(m.settings_saved(), { duration: 1500 });
			} else {
				toast.error(m.settings_save_failed());
			}
		} catch {
			toast.error(m.settings_save_failed());
		}
	};

	const defaultMealSet = new Set(DEFAULT_MEAL_TYPES as readonly string[]);

	const buildMealOrder = (order: string[]) => {
		mealOrder = order.map((name) => ({
			id: name,
			name,
			isDefault: defaultMealSet.has(name)
		}));
		for (const mt of mealTypes) {
			if (!order.includes(mt.name)) {
				mealOrder = [...mealOrder, { id: mt.name, name: mt.name, isDefault: false }];
			}
		}
	};

	const loadMealTypes = async () => {
		const { data } = await api.GET('/api/meal-types');
		if (data) mealTypes = data.mealTypes;
		const p = cachedPrefs.value;
		buildMealOrder(p?.mealOrder ?? mealOrder.map((mo) => mo.name));
	};

	const addMealType = async () => {
		if (!newName.trim()) return;
		await api.POST('/api/meal-types', {
			body: { name: newName, sortOrder: mealTypes.length + 1 }
		});
		const addedName = newName.trim();
		newName = '';
		await loadMealTypes();
		const newOrder = [...mealOrder.map((mo) => mo.name), addedName];
		const unique = [...new Set(newOrder)];
		await savePreference('mealOrder', unique);
		buildMealOrder(unique);
	};

	const removeMealType = async (id: string) => {
		if (referencedCustomMealTypeIds.has(id)) {
			toast.error('Remove the favorites timeframe configuration for this meal first.');
			return;
		}
		const meal = mealTypes.find((mt) => mt.id === id);
		const { error } = await api.DELETE('/api/meal-types/{id}', {
			params: { path: { id } }
		});
		if (!error) {
			await loadMealTypes();
			if (meal) {
				const newOrder = mealOrder.filter((mo) => mo.name !== meal.name).map((mo) => mo.name);
				await savePreference('mealOrder', newOrder);
				buildMealOrder(newOrder);
			}
			return;
		}
		toast.error((error as { error?: string })?.error ?? m.settings_save_failed());
	};

	const handleMealSort = (event: CustomEvent | { detail?: unknown } | any) => {
		const { draggedItemIndex, targetItemIndex } = event;
		if (draggedItemIndex == null || targetItemIndex == null) return;
		mealOrder = sortItems(mealOrder, draggedItemIndex, targetItemIndex);
		const newOrder = mealOrder.map((mo) => mo.name);
		savePreference('mealOrder', newOrder);
	};

	const handleWidgetSort = (event: CustomEvent | { detail?: unknown } | any) => {
		const { draggedItemIndex, targetItemIndex } = event;
		if (draggedItemIndex == null || targetItemIndex == null) return;
		widgetOrder = sortItems(widgetOrder, draggedItemIndex, targetItemIndex);
		const newOrder = widgetOrder.map((w) => w.key);
		savePreference('widgetOrder', newOrder);
	};

	const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';
	const user = $derived(getUser());

	onMount(() => {
		loadMealTypes();
	});
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<!-- Account & Language — compact, side by side on desktop -->
	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.settings_account()}</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if user}
					<p class="font-bold">{user.name ?? ''}</p>
					<p class="text-muted-foreground text-sm">{user.email ?? ''}</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.settings_language()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<LanguageSwitcher {savePreference} />
			</Card.Content>
		</Card.Root>
	</div>

	<!-- 3. Dashboard Sections -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_dashboard_sections()}</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if prefsLoaded}
				<SortableList.Root gap={8} ondrop={handleWidgetSort}>
					{#each widgetOrder as widget, index (widget.id)}
						<SortableList.Item id={widget.id} {index}>
							<div class="flex items-center gap-3 rounded-md border p-3">
								<SortableList.ItemHandle>
									<GripVertical class="text-muted-foreground h-5 w-5 cursor-grab" />
								</SortableList.ItemHandle>
								<div class="flex-1">
									<p class="text-sm font-medium">{widget.name()}</p>
									<p class="text-muted-foreground text-xs">{widget.desc()}</p>
								</div>
								{#if widget.key === 'chart'}
									<Switch
										bind:checked={showChartWidget}
										onCheckedChange={(v) => savePreference('showChartWidget', v)}
									/>
								{:else if widget.key === 'favorites'}
									<Switch
										bind:checked={showFavoritesWidget}
										onCheckedChange={(v) => savePreference('showFavoritesWidget', v)}
									/>
								{:else if widget.key === 'supplements'}
									<Switch
										bind:checked={showSupplementsWidget}
										onCheckedChange={(v) => savePreference('showSupplementsWidget', v)}
									/>
								{:else if widget.key === 'weight'}
									<Switch
										bind:checked={showWeightWidget}
										onCheckedChange={(v) => savePreference('showWeightWidget', v)}
									/>
								{:else if widget.key === 'meal-breakdown'}
									<Switch
										bind:checked={showMealBreakdownWidget}
										onCheckedChange={(v) => savePreference('showMealBreakdownWidget', v)}
									/>
								{:else if widget.key === 'top-foods'}
									<Switch
										bind:checked={showTopFoodsWidget}
										onCheckedChange={(v) => savePreference('showTopFoodsWidget', v)}
									/>
								{:else if widget.key === 'sleep'}
									<Switch
										bind:checked={showSleepWidget}
										onCheckedChange={(v) => savePreference('showSleepWidget', v)}
									/>
								{/if}
							</div>
						</SortableList.Item>
					{/each}
				</SortableList.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- 4. Meal Types (order + custom) -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_custom_meals()}</Card.Title>
			<p class="text-muted-foreground text-sm">{m.settings_meal_order_desc()}</p>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if prefsLoaded}
				<SortableList.Root gap={8} ondrop={handleMealSort}>
					{#each mealOrder as meal, index (meal.id)}
						<SortableList.Item id={meal.id} {index}>
							<div class="flex items-center gap-3 rounded-md border p-3">
								<SortableList.ItemHandle>
									<GripVertical class="text-muted-foreground h-5 w-5 cursor-grab" />
								</SortableList.ItemHandle>
								<div class="flex-1">
									<p class="text-sm font-medium">{meal.name}</p>
									{#if meal.isDefault}
										<p class="text-muted-foreground text-xs">{m.settings_default_meal()}</p>
									{/if}
								</div>
								{#if !meal.isDefault}
									{@const customMeal = mealTypes.find((mt) => mt.name === meal.name)}
									{#if customMeal}
										<Button
											variant="outline"
											size="icon"
											disabled={referencedCustomMealTypeIds.has(customMeal.id)}
											onclick={() => removeMealType(customMeal.id)}
										>
											<Trash2 class="h-4 w-4" />
										</Button>
									{/if}
								{/if}
							</div>
						</SortableList.Item>
					{/each}
				</SortableList.Root>
			{/if}
			<div class="mt-2 flex gap-2">
				<Input
					class="flex-1"
					placeholder={m.settings_add_meal_placeholder()}
					bind:value={newName}
					onkeydown={(e) => e.key === 'Enter' && addMealType()}
				/>
				<Button onclick={addMealType}>{m.settings_add()}</Button>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- 5. Favorites Logging Section -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_favorites_logging()}</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="space-y-2">
				<Label>{m.settings_meal_assignment()}</Label>
				<RadioGroup.Root
					value={favoriteMealAssignmentMode}
					onValueChange={(v) => (favoriteMealAssignmentMode = v as 'time_based' | 'ask_meal')}
					class="flex flex-col gap-3"
				>
					<div class="flex items-center gap-2">
						<RadioGroup.Item value="time_based" id="favorites-meal-time-based" />
						<Label for="favorites-meal-time-based">{m.settings_meal_auto_assign()}</Label>
					</div>
					<div class="flex items-center gap-2">
						<RadioGroup.Item value="ask_meal" id="favorites-meal-ask" />
						<Label for="favorites-meal-ask">{m.settings_meal_always_ask()}</Label>
					</div>
				</RadioGroup.Root>
			</div>

			<div class="space-y-3">
				<div class="flex items-center justify-between gap-2">
					<div>
						<p class="text-sm font-medium">{m.settings_auto_assignment_timeframes()}</p>
						<p class="text-muted-foreground text-xs">
							{m.settings_auto_assignment_timeframes_desc()}
						</p>
					</div>
					<Button variant="outline" size="sm" onclick={addFavoriteMealTimeframe}>
						<Plus class="size-4" />
						{m.settings_add_timeframe()}
					</Button>
				</div>

				{#if favoriteMealTimeframes.length === 0}
					<p class="text-muted-foreground text-sm">{m.settings_no_timeframes()}</p>
				{/if}

				<div class="space-y-2">
					{#each favoriteMealTimeframes as row (row.id)}
						<div
							class={`grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,1.2fr)_1fr_1fr_auto] ${
								overlappingRowIds.has(row.id) ? 'border-destructive/60 bg-destructive/5' : ''
							}`}
						>
							<div class="space-y-1">
								<Label class="text-xs">{m.settings_timeframe_meal()}</Label>
								<Select.Root
									type="single"
									value={mealTypeSelectValue(row)}
									onValueChange={(v) => setRowMealSelection(row.id, v)}
								>
									<Select.Trigger class="w-full">
										<span>
											{mealTypeOptions.find((opt) => opt.value === mealTypeSelectValue(row))
												?.label ?? row.mealType}
										</span>
									</Select.Trigger>
									<Select.Content>
										{#each mealTypeOptions as option}
											<Select.Item value={option.value}>{option.label}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
							<div class="space-y-1">
								<Label for={`start-${row.id}`} class="text-xs">{m.settings_timeframe_from()}</Label>
								<Input
									id={`start-${row.id}`}
									type="time"
									value={row.startTime}
									oninput={(e) =>
										updateFavoriteMealTimeframe(row.id, {
											startTime: (e.currentTarget as HTMLInputElement).value
										})}
								/>
							</div>
							<div class="space-y-1">
								<Label for={`end-${row.id}`} class="text-xs">{m.settings_timeframe_to()}</Label>
								<Input
									id={`end-${row.id}`}
									type="time"
									value={row.endTime}
									oninput={(e) =>
										updateFavoriteMealTimeframe(row.id, {
											endTime: (e.currentTarget as HTMLInputElement).value
										})}
								/>
							</div>
							<div class="flex items-end">
								<Button
									variant="ghost"
									size="icon"
									aria-label="Remove timeframe"
									onclick={() => removeFavoriteMealTimeframe(row.id)}
								>
									<Trash2 class="size-4" />
								</Button>
							</div>
						</div>
					{/each}
				</div>

				{#if !timeframeValidation.valid}
					<p class="text-destructive text-sm">{timeframeValidation.message}</p>
				{/if}
			</div>

			<div class="flex justify-end">
				<Button
					onclick={saveFavoriteLoggingConfig}
					disabled={savingFavoriteLogging || !timeframeValidation.valid}
				>
					{savingFavoriteLogging ? m.settings_saving() : m.settings_save()}
				</Button>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- 6. Visible Nutrients Section -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_visible_nutrients()}</Card.Title>
			<Card.Description>{m.settings_visible_nutrients_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={selectAllNutrients}>
					{m.settings_select_all()}
				</Button>
				<Button variant="outline" size="sm" onclick={deselectAllNutrients}>
					{m.settings_deselect_all()}
				</Button>
			</div>
			{#each CATEGORY_ORDER as category}
				{@const nutrients = NUTRIENTS_BY_CATEGORY[category]}
				<div>
					<p class="mb-2 text-sm font-medium">{getCategoryLabel(msgs, category)}</p>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{#each nutrients as nutrient}
							<div class="flex items-center gap-2">
								<Checkbox
									id={`nutrient-${nutrient.key}`}
									checked={visibleNutrients.has(nutrient.key)}
									onCheckedChange={() => toggleNutrient(nutrient.key)}
								/>
								<Label for={`nutrient-${nutrient.key}`} class="text-sm">
									{getNutrientLabel(msgs, nutrient)}
								</Label>
							</div>
						{/each}
					</div>
				</div>
			{/each}
			<div class="flex justify-end">
				<Button onclick={saveVisibleNutrients} disabled={savingNutrients}>
					{savingNutrients ? m.goals_saving() : m.goals_save()}
				</Button>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- About & Start Page — compact, side by side on desktop -->
	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.settings_about()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<p class="text-muted-foreground text-sm">{m.settings_version()} {appVersion}</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.settings_start_page()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<RadioGroup.Root
					value={startPage}
					onValueChange={(v) => {
						startPage = v;
						savePreference('startPage', v);
					}}
					class="flex flex-col gap-3"
				>
					<div class="flex items-center gap-2">
						<RadioGroup.Item value="dashboard" id="start-dashboard" />
						<Label for="start-dashboard">{m.settings_start_page_dashboard()}</Label>
					</div>
					<div class="flex items-center gap-2">
						<RadioGroup.Item value="favorites" id="start-favorites" />
						<Label for="start-favorites">{m.settings_start_page_favorites()}</Label>
					</div>
				</RadioGroup.Root>
			</Card.Content>
		</Card.Root>
	</div>
</div>
