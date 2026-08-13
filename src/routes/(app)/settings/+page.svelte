<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import { SortableList, sortItems } from '@rodrigodagostino/svelte-sortable-list';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { getUser } from '$lib/stores/auth.svelte';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api/client';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
	import * as m from '$lib/paraglide/messages';
	import NutrientSelector from './NutrientSelector.svelte';
	import FavoriteMealTimeframeManager, {
		type AssignmentMode,
		type TimeframeDraft
	} from './FavoriteMealTimeframeManager.svelte';
	import WidgetOrderEditor, { type WidgetVisibility } from './WidgetOrderEditor.svelte';
	import ConnectedAccounts from './ConnectedAccounts.svelte';

	let mealTypes: Array<{ id: string; name: string; sortOrder: number }> = $state([]);
	let deleteAccountOpen = $state(false);
	let deletingAccount = $state(false);
	let newName = $state('');

	let mealOrder = $state<Array<{ id: string; name: string; isDefault: boolean }>>([]);
	let startPage = $state('dashboard');
	let favoriteMealAssignmentMode = $state<AssignmentMode>('time_based');
	let favoriteMealTimeframes = $state<TimeframeDraft[]>([]);

	const cachedPrefs = useLiveQuery(() => preferencesService.preferences(), undefined);

	const prefsLoaded = $derived(cachedPrefs.value != null);

	const widgetOrderKeys = $derived(
		cachedPrefs.value?.widgetOrder ?? [
			'chart',
			'favorites',
			'supplements',
			'weight',
			'summary',
			'daylog'
		]
	);

	const widgetVisibility = $derived.by((): WidgetVisibility => {
		const p = cachedPrefs.value;
		return {
			chart: p?.showChartWidget ?? true,
			favorites: p?.showFavoritesWidget ?? true,
			supplements: p?.showSupplementsWidget ?? true,
			weight: p?.showWeightWidget ?? true,
			mealBreakdown: p?.showMealBreakdownWidget ?? true,
			topFoods: p?.showTopFoodsWidget ?? true,
			sleep: p?.showSleepWidget ?? true
		};
	});

	$effect(() => {
		preferencesService.refresh();
	});

	$effect(() => {
		const p = cachedPrefs.value;
		if (p) {
			startPage = p.startPage ?? 'dashboard';
			favoriteMealAssignmentMode = (p.favoriteMealAssignmentMode ?? 'time_based') as AssignmentMode;
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
			buildMealOrder(p.mealOrder ?? ['Breakfast', 'Lunch', 'Dinner', 'Snacks']);
		}
	});

	const referencedCustomMealTypeIds = $derived(
		new Set(favoriteMealTimeframes.map((row) => row.customMealTypeId).filter(Boolean) as string[])
	);

	const savePreference = async (key: string, value: unknown) => {
		try {
			const ok = await preferencesService.update({ [key]: value } as Parameters<
				typeof preferencesService.update
			>[0]);
			if (ok) toast.success(m.settings_saved(), { duration: 1500 });
			else toast.error(m.settings_save_failed());
		} catch {
			toast.error(m.settings_save_failed());
		}
	};

	const saveVisibleNutrients = async (keys: string[]) => {
		return preferencesService.update({ visibleNutrients: keys });
	};

	const saveFavoriteLogging = async (config: {
		favoriteMealAssignmentMode: AssignmentMode;
		favoriteMealTimeframes: Array<Omit<TimeframeDraft, 'id'>>;
	}) => {
		return preferencesService.update(config);
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

	const handleMealSort = (event: any) => {
		const { draggedItemIndex, targetItemIndex } = event;
		if (draggedItemIndex == null || targetItemIndex == null) return;
		mealOrder = sortItems(mealOrder, draggedItemIndex, targetItemIndex);
		const newOrder = mealOrder.map((mo) => mo.name);
		savePreference('mealOrder', newOrder);
	};

	const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';
	const user = $derived(getUser());

	onMount(() => {
		loadMealTypes();
	});

	async function deleteAccount() {
		if (deletingAccount) return;
		deletingAccount = true;
		try {
			const response = await fetch('/api/account', { method: 'DELETE' });
			if (!response.ok) throw new Error('Request failed');
			const { clearAllData, clearCacheStorage } = await import('$lib/db');
			await clearAllData().catch(() => {});
			await clearCacheStorage().catch(() => {});
			window.location.href = '/';
		} catch {
			toast.error(m.settings_delete_account_failed());
			deletingAccount = false;
			deleteAccountOpen = false;
		}
	}
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

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.connected_accounts()}</Card.Title>
			<Card.Description>{m.connected_accounts_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<ConnectedAccounts />
		</Card.Content>
	</Card.Root>

	{#if prefsLoaded}
		<WidgetOrderEditor
			order={widgetOrderKeys}
			visibility={widgetVisibility}
			onSavePreference={savePreference}
		/>
	{/if}

	<!-- Meal Types (order + custom) -->
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

	<FavoriteMealTimeframeManager
		bind:mode={favoriteMealAssignmentMode}
		bind:timeframes={favoriteMealTimeframes}
		{mealTypes}
		onSave={saveFavoriteLogging}
	/>

	<NutrientSelector
		initialVisible={cachedPrefs.value?.visibleNutrients}
		onSave={saveVisibleNutrients}
	/>

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

	<Card.Root class="border-destructive/50">
		<Card.Header>
			<Card.Title class="text-destructive">{m.settings_danger_zone()}</Card.Title>
			<p class="text-muted-foreground text-sm">{m.settings_delete_account_desc()}</p>
		</Card.Header>
		<Card.Content>
			<Button variant="destructive" onclick={() => (deleteAccountOpen = true)}>
				<Trash2 class="size-4" />
				{m.settings_delete_account()}
			</Button>
		</Card.Content>
	</Card.Root>

	<AlertDialog.Root bind:open={deleteAccountOpen}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title class="text-left">
					{m.settings_delete_account_confirm_title()}
				</AlertDialog.Title>
				<AlertDialog.Description>
					{m.settings_delete_account_confirm_desc()}
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel disabled={deletingAccount}>{m.cancel()}</AlertDialog.Cancel>
				<AlertDialog.Action
					class={buttonVariants({ variant: 'destructive' })}
					disabled={deletingAccount}
					onclick={(e) => {
						e.preventDefault();
						deleteAccount();
					}}
				>
					<Trash2 class="size-4" />
					{m.settings_delete_account_confirm()}
				</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</div>
