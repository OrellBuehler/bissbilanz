<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import { SortableList, sortItems } from '@rodrigodagostino/svelte-sortable-list';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { getUser } from '$lib/stores/auth.svelte';
	import { toast } from 'svelte-sonner';
	import { apiFetch } from '$lib/utils/api';
	import * as m from '$lib/paraglide/messages';

	// Meal types state (preserved from existing page)
	let mealTypes: Array<{ id: string; name: string; sortOrder: number }> = $state([]);
	let newName = $state('');

	// Preferences state
	let showFavoritesWidget = $state(true);
	let showSupplementsWidget = $state(true);
	let showWeightWidget = $state(true);
	let widgetOrder = $state<Array<{ id: string; name: () => string; desc: () => string; key: string }>>([]);
	let startPage = $state('dashboard');
	let prefsLoaded = $state(false);

	const WIDGET_DEFS: Record<string, { name: () => string; desc: () => string }> = {
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
		}
	};

	const buildWidgetOrder = (order: string[]) =>
		order.map((key) => ({
			id: key,
			key,
			name: WIDGET_DEFS[key]?.name ?? (() => key),
			desc: WIDGET_DEFS[key]?.desc ?? (() => '')
		}));

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
				widgetOrder = buildWidgetOrder(
					preferences.widgetOrder ?? ['favorites', 'supplements', 'weight']
				);
				startPage = preferences.startPage ?? 'dashboard';
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
		await apiFetch(`/api/meal-types/${id}`, { method: 'DELETE' });
		await loadMealTypes();
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

<div class="mx-auto max-w-2xl space-y-6">
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

	<!-- 3. Dashboard Widgets Section -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_dashboard_widgets()}</Card.Title>
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
						<Button variant="outline" size="sm" onclick={() => removeMealType(meal.id)}>
							{m.settings_remove()}
						</Button>
					</li>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>

	<!-- 5. About Section -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_about()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-muted-foreground text-sm">{m.settings_version()} {appVersion}</p>
		</Card.Content>
	</Card.Root>

	<!-- 6. Start Page Section -->
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
