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
	import { apiFetch } from '$lib/utils/api';
	import { DEFAULT_MEAL_TYPES, validateFavoriteMealTimeframes } from '$lib/utils/meals';
	import * as m from '$lib/paraglide/messages';

	// Meal types state (preserved from existing page)
	let mealTypes: Array<{ id: string; name: string; sortOrder: number }> = $state([]);
	let newName = $state('');

	// Preferences state
	let showFavoritesWidget = $state(true);
	let showSupplementsWidget = $state(true);
	let showWeightWidget = $state(true);
	let showTopFoodsWidget = $state(true);
	let widgetOrder = $state<
		Array<{ id: string; name: () => string; desc: () => string; key: string }>
	>([]);
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

	const WIDGET_DEFS: Record<string, { name: () => string; desc: () => string }> = {
		chart: {
			name: () => m.settings_section_chart(),
			desc: () => m.settings_section_chart_desc()
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
		'top-foods': {
			name: () => m.settings_widget_top_foods(),
			desc: () => m.settings_widget_top_foods_desc()
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
			const res = await apiFetch('/api/preferences', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					favoriteMealAssignmentMode,
					favoriteMealTimeframes: favoriteMealTimeframes.map((row) => ({
						mealType: row.mealType,
						customMealTypeId: row.customMealTypeId,
						startTime: row.startTime,
						endTime: row.endTime
					}))
				})
			});
			if (res.ok) {
				toast.success(m.settings_saved(), { duration: 1500 });
				const { preferences } = await res.json();
				favoriteMealAssignmentMode = preferences.favoriteMealAssignmentMode ?? 'time_based';
				favoriteMealTimeframes =
					(preferences.favoriteMealTimeframes ?? []).map((row: any) => ({
						id: row.id ?? crypto.randomUUID(),
						mealType: row.mealType,
						customMealTypeId: row.customMealTypeId ?? null,
						startTime: row.startTime,
						endTime: row.endTime
					})) ?? [];
			} else {
				const data = await res.json().catch(() => ({}));
				toast.error(data.error ?? m.settings_save_failed());
			}
		} catch {
			toast.error(m.settings_save_failed());
		} finally {
			savingFavoriteLogging = false;
		}
	};

	const savePreference = async (key: string, value: unknown) => {
		try {
			const res = await apiFetch('/api/preferences', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ [key]: value })
			});
			if (res.ok) {
				toast.success(m.settings_saved(), { duration: 1500 });
			} else {
				toast.error(m.settings_save_failed());
			}
		} catch {
			toast.error(m.settings_save_failed());
		}
	};

	const loadPreferences = async () => {
		try {
			const res = await fetch('/api/preferences');
			if (res.ok) {
				const { preferences } = await res.json();
				showFavoritesWidget = preferences.showFavoritesWidget ?? true;
				showSupplementsWidget = preferences.showSupplementsWidget ?? true;
				showWeightWidget = preferences.showWeightWidget ?? true;
				showTopFoodsWidget = preferences.showTopFoodsWidget ?? true;
				widgetOrder = buildWidgetOrder(
					preferences.widgetOrder ?? [
						'chart',
						'favorites',
						'supplements',
						'weight',
						'summary',
						'daylog'
					]
				);
				startPage = preferences.startPage ?? 'dashboard';
				favoriteMealAssignmentMode = preferences.favoriteMealAssignmentMode ?? 'time_based';
				favoriteMealTimeframes = (preferences.favoriteMealTimeframes ?? []).map((row: any) => ({
					id: row.id ?? crypto.randomUUID(),
					mealType: row.mealType,
					customMealTypeId: row.customMealTypeId ?? null,
					startTime: row.startTime,
					endTime: row.endTime
				}));
			}
		} catch {
			// Use defaults
		}
		prefsLoaded = true;
	};

	// Meal type helpers (preserved)
	const loadMealTypes = async () => {
		const res = await fetch('/api/meal-types');
		mealTypes = (await res.json()).mealTypes;
	};

	const addMealType = async () => {
		if (!newName.trim()) return;
		await apiFetch('/api/meal-types', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: newName, sortOrder: mealTypes.length + 1 })
		});
		newName = '';
		await loadMealTypes();
	};

	const removeMealType = async (id: string) => {
		if (referencedCustomMealTypeIds.has(id)) {
			toast.error('Remove the favorites timeframe configuration for this meal first.');
			return;
		}
		const res = await apiFetch(`/api/meal-types/${id}`, { method: 'DELETE' });
		if (res.ok) {
			await loadMealTypes();
			return;
		}
		const data = await res.json().catch(() => ({}));
		toast.error(data.error ?? m.settings_save_failed());
	};

	const handleWidgetSort = (event: CustomEvent | { detail?: unknown } | any) => {
		// The ondrop event from svelte-sortable-list provides draggedItemIndex and targetItemIndex
		const { draggedItemIndex, targetItemIndex } = event;
		if (draggedItemIndex == null || targetItemIndex == null) return;
		widgetOrder = sortItems(widgetOrder, draggedItemIndex, targetItemIndex);
		const newOrder = widgetOrder.map((w) => w.key);
		savePreference('widgetOrder', newOrder);
	};

	const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';
	const user = $derived(getUser());

	onMount(() => {
		loadPreferences();
		loadMealTypes();
	});
</script>

<div class="space-y-6">
	<!-- 1. Account Section -->
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

	<!-- 2. Language Section -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_language()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<LanguageSwitcher {savePreference} />
		</Card.Content>
	</Card.Root>

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
								{#if widget.key === 'favorites'}
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
								{:else if widget.key === 'top-foods'}
									<Switch
										bind:checked={showTopFoodsWidget}
										onCheckedChange={(v) => savePreference('showTopFoodsWidget', v)}
									/>
								{/if}
							</div>
						</SortableList.Item>
					{/each}
				</SortableList.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- 4. Custom Meal Types Section (preserved) -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_custom_meals()}</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="flex gap-2">
				<Input
					class="flex-1"
					placeholder={m.settings_add_meal_placeholder()}
					bind:value={newName}
					onkeydown={(e) => e.key === 'Enter' && addMealType()}
				/>
				<Button onclick={addMealType}>{m.settings_add()}</Button>
			</div>
			<ul class="space-y-2">
				{#each mealTypes as meal}
					<li class="flex items-center justify-between rounded-md border p-2">
						<span>{meal.name}</span>
						<Button
							variant="outline"
							size="sm"
							disabled={referencedCustomMealTypeIds.has(meal.id)}
							onclick={() => removeMealType(meal.id)}
						>
							{m.settings_remove()}
						</Button>
					</li>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>

	<!-- 5. Favorites Logging Section -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Favorites Logging</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="space-y-2">
				<Label>Meal assignment</Label>
				<RadioGroup.Root
					value={favoriteMealAssignmentMode}
					onValueChange={(v) => (favoriteMealAssignmentMode = v as 'time_based' | 'ask_meal')}
					class="flex flex-col gap-3"
				>
					<div class="flex items-center gap-2">
						<RadioGroup.Item value="time_based" id="favorites-meal-time-based" />
						<Label for="favorites-meal-time-based">Auto-assign by timeframes</Label>
					</div>
					<div class="flex items-center gap-2">
						<RadioGroup.Item value="ask_meal" id="favorites-meal-ask" />
						<Label for="favorites-meal-ask">Always ask which meal</Label>
					</div>
				</RadioGroup.Root>
			</div>

			<div class="space-y-3">
				<div class="flex items-center justify-between gap-2">
					<div>
						<p class="text-sm font-medium">Auto-assignment timeframes</p>
						<p class="text-muted-foreground text-xs">
							Outside configured timeframes, the app asks which meal to use.
						</p>
					</div>
					<Button variant="outline" size="sm" onclick={addFavoriteMealTimeframe}>
						<Plus class="size-4" />
						Add timeframe
					</Button>
				</div>

				{#if favoriteMealTimeframes.length === 0}
					<p class="text-muted-foreground text-sm">
						No timeframes configured. Favorites will ask for a meal unless you add a matching
						window.
					</p>
				{/if}

				<div class="space-y-2">
					{#each favoriteMealTimeframes as row (row.id)}
						<div
							class={`grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,1.2fr)_1fr_1fr_auto] ${
								overlappingRowIds.has(row.id) ? 'border-destructive/60 bg-destructive/5' : ''
							}`}
						>
							<div class="space-y-1">
								<Label class="text-xs">Meal</Label>
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
								<Label for={`start-${row.id}`} class="text-xs">From</Label>
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
								<Label for={`end-${row.id}`} class="text-xs">To</Label>
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
					{savingFavoriteLogging ? 'Saving...' : 'Save'}
				</Button>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- 6. About Section -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_about()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-muted-foreground text-sm">{m.settings_version()} {appVersion}</p>
		</Card.Content>
	</Card.Root>

	<!-- 7. Start Page Section -->
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
