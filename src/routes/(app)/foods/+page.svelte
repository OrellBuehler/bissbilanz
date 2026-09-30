<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { untrack } from 'svelte';
	import FoodList from '$lib/components/foods/FoodList.svelte';
	import FoodsToolbar from '$lib/components/foods/FoodsToolbar.svelte';
	import OffSearchResults from '$lib/components/foods/OffSearchResults.svelte';
	import FoodFormModal from '$lib/components/foods/FoodFormModal.svelte';
	import FoodDeleteConflictDialog, {
		type FoodDeleteConflict
	} from '$lib/components/foods/FoodDeleteConflictDialog.svelte';
	import BulkDeleteDialogs from '$lib/components/foods/BulkDeleteDialogs.svelte';
	import MergeFoodDialog from '$lib/components/foods/MergeFoodDialog.svelte';
	import DuplicatesBanner from '$lib/components/foods/DuplicatesBanner.svelte';
	import BulkActionBar from '$lib/components/foods/BulkActionBar.svelte';
	import BulkLabelsDialog from '$lib/components/foods/BulkLabelsDialog.svelte';
	import FoodImportDialog from '$lib/components/foods/FoodImportDialog.svelte';
	import FoodPackageExportDialog from '$lib/components/food-package/FoodPackageExportDialog.svelte';
	import FoodPackageImportDialog from '$lib/components/food-package/FoodPackageImportDialog.svelte';
	import type { BulkLabelMode } from '$lib/components/foods/bulkActions';
	import type { FoodCsvFood } from '$lib/foods/csv';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import type { components } from '$lib/api/generated/schema';

	import { toast } from 'svelte-sonner';
	import { browser } from '$app/environment';
	import * as Sentry from '@sentry/sveltekit';
	import * as m from '$lib/paraglide/messages';
	import { removeImage, uploadImage, uploadImageFile } from '$lib/utils/image-upload';
	import { DEFAULT_VISIBLE_NUTRIENTS, pickNutrients } from '$lib/nutrients';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { foodService } from '$lib/services/food-service.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import { consumeQuickAction } from '$lib/stores/command-palette.svelte';
	import HintCard from '$lib/components/help/HintCard.svelte';
	import { isDismissed } from '$lib/stores/hints.svelte';

	let visibleNutrients = $state<string[]>([...DEFAULT_VISIBLE_NUTRIENTS]);
	let query = $state('');
	let showForm = $state(false);
	let editingFood = $state<components['schemas']['Food'] | null>(null);
	let formImageUrl: string | null = $state(null);
	// The create form's image can come from a scanned OFF product rather than an
	// upload, so "removed" needs its own flag: clearing `formImageUrl` alone
	// would just fall back to `offData.imageUrl`.
	let formImageCleared = $state(false);
	let uploading = $state(false);

	let offData = $state<components['schemas']['OpenFoodFactsProduct'] | null>(null);
	let offLoading = $state(false);
	let offNotFound = $state(false);
	let activeBarcode = $state('');
	let offResults = $state<components['schemas']['OpenFoodFactsProduct'][]>([]);
	let offSearchLoading = $state(false);
	// Below this many local matches, offer Open Food Facts results to fill the gap.
	const OFF_FALLBACK_THRESHOLD = 5;
	let deleteConflict = $state<FoodDeleteConflict | null>(null);
	let qualityOpen = $state(false);

	let selecting = $state(false);
	let selectedIds = $state<string[]>([]);
	let bulkBusy = $state(false);
	let bulkLabelsOpen = $state(false);
	let bulkDeleteOpen = $state(false);
	let blockedIds = $state<string[]>([]);
	let importOpen = $state(false);
	let importing = $state(false);
	let packageImportOpen = $state(false);
	let packageExportOpen = $state(false);
	let packageExportIds = $state<string[]>([]);

	let mergeOpen = $state(false);
	let mergeCandidates = $state<components['schemas']['Food'][]>([]);
	let duplicateGroups = $state<components['schemas']['FoodDuplicateGroup'][]>([]);

	const refreshDuplicates = async () => {
		try {
			const { data } = await foodService.duplicates();
			if (data) duplicateGroups = data.groups;
		} catch (err) {
			Sentry.captureException(err);
			duplicateGroups = [];
		}
	};

	const openMergeFromMenu = async (id: string) => {
		const { data } = await foodService.fetchById(id);
		if (!data) return;
		mergeCandidates = [data.food];
		mergeOpen = true;
	};

	const openMergeFromGroup = (group: components['schemas']['FoodDuplicateGroup']) => {
		const pool = (allFoodsQuery.value as unknown as components['schemas']['Food'][]) ?? [];
		const byId = new Map(pool.map((f) => [f.id, f]));
		mergeCandidates = group.foods
			.map((f) => byId.get(f.id))
			.filter((f): f is components['schemas']['Food'] => f !== undefined);
		mergeOpen = true;
	};

	const onMergeCompleted = () => {
		foodService.refresh();
		refreshDuplicates();
	};

	let debouncedQuery = $state('');
	let debounceTimer: ReturnType<typeof setTimeout>;

	$effect(() => {
		const q = query;
		debounceTimer = setTimeout(() => {
			debouncedQuery = q;
		}, 300);
		return () => clearTimeout(debounceTimer);
	});

	const allFoodsQuery = useLiveQuery(() => foodService.allFoods(), []);
	const searchResults = useLiveQuery(
		() => (debouncedQuery ? foodService.search(debouncedQuery) : foodService.allFoods()),
		[]
	);

	const foods = $derived(debouncedQuery ? searchResults.value : allFoodsQuery.value);

	// Online Open Food Facts fallback when the personal DB has few matches.
	$effect(() => {
		const q = debouncedQuery.trim();
		const localCount = foods.length;
		if (!browser || q.length < 2 || localCount >= OFF_FALLBACK_THRESHOLD) {
			offResults = [];
			offSearchLoading = false;
			return;
		}
		let cancelled = false;
		offSearchLoading = true;
		foodService
			.searchOff(q)
			.then(({ data }) => {
				if (!cancelled) offResults = data?.results ?? [];
			})
			.catch((e) => {
				if (navigator.onLine) Sentry.captureException(e, { extra: { context: 'foods.offSearch' } });
				if (!cancelled) offResults = [];
			})
			.finally(() => {
				if (!cancelled) offSearchLoading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (browser) {
			foodService.refresh();
			refreshDuplicates();
		}
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- FoodFormData is local to FoodForm.svelte
	const createFood = async (payload: any) => {
		const body = offData
			? {
					...payload,
					novaGroup: offData.novaGroup,
					additives: offData.additives,
					ingredientsText: offData.ingredientsText,
					imageUrl: offData.imageUrl,
					// Raw OFF categories; the server derives the food's labels from them.
					categoriesTags: offData.categoriesTags
				}
			: payload;
		try {
			const { error } = await foodService.createOnline(
				formImageCleared
					? { ...body, imageUrl: null }
					: formImageUrl
						? { ...body, imageUrl: formImageUrl }
						: body
			);
			if (error) {
				if (error.error === 'duplicate_barcode') {
					toast.error(m.detail_duplicate_barcode());
				} else {
					toast.error(m.detail_create_failed());
				}
				return;
			}
		} catch (err) {
			Sentry.captureException(err);
			toast.error(m.detail_create_failed());
			return;
		}
		resetFormState();
		foodService.refresh();
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- FoodFormData is local to FoodForm.svelte
	const updateFood = async (payload: any) => {
		if (!editingFood) return;
		const { labels, ...fields } = payload as { labels?: string[] };
		const { error } = await foodService.updateOnline(editingFood.id, {
			...fields,
			imageUrl: formImageUrl
		});
		if (error) {
			if (error.error === 'duplicate_barcode') {
				toast.error(m.detail_duplicate_barcode());
			} else {
				toast.error(m.detail_save_failed());
			}
			return;
		}
		// Labels live in their own table: only an actual edit is sent, because a
		// user write is authoritative and replaces whatever a labeller had seeded.
		// It goes through the food service so it is optimistic and queues offline.
		const before = editingFood.labels ?? [];
		if (
			labels &&
			(labels.length !== before.length || labels.some((label, i) => label !== before[i]))
		) {
			try {
				const dropped = await foodService.setLabels(editingFood.id, labels);
				if (dropped.length > 0) {
					toast.info(m.detail_labels_dropped({ labels: dropped.join(', ') }));
				}
			} catch (err) {
				Sentry.captureException(err, { extra: { foodId: editingFood.id } });
				toast.error(m.detail_save_failed());
				return;
			}
		}
		toast.success(m.detail_saved());
		const updatedId = editingFood.id;
		resetFormState();
		foodService.refreshById(updatedId);
	};

	const deleteFood = async (id: string) => {
		const { error, response } = await foodService.deleteOnline(id);
		if (response.status === 409 && error) {
			const conflict = error as {
				entryCount?: number;
				recipeCount?: number;
				supplementIngredientCount?: number;
				lastIngredientRecipes?: { id: string; name: string }[];
			};
			deleteConflict = {
				id,
				name: foods.find((food) => food.id === id)?.name ?? '',
				entryCount: conflict.entryCount ?? 0,
				recipeCount: conflict.recipeCount ?? 0,
				supplementCount: conflict.supplementIngredientCount ?? 0,
				lastRecipes: conflict.lastIngredientRecipes ?? []
			};
			return;
		}
		foodService.refresh();
	};

	const confirmForceDelete = async () => {
		if (!deleteConflict) return;
		await foodService.deleteOnline(deleteConflict.id, true);
		deleteConflict = null;
		foodService.refresh();
	};

	const toggleSelect = (id: string) => {
		selectedIds = selectedIds.includes(id)
			? selectedIds.filter((selected) => selected !== id)
			: [...selectedIds, id];
	};

	const exitSelection = () => {
		selecting = false;
		selectedIds = [];
	};

	const reportBulk = (result: { succeeded: number; failed: number } | null) => {
		if (!result) {
			toast.error(m.foods_bulk_failed());
			return false;
		}
		if (result.failed > 0) {
			toast.warning(m.foods_bulk_partial({ succeeded: result.succeeded, failed: result.failed }));
		} else {
			toast.success(m.foods_bulk_success({ count: result.succeeded }));
		}
		return true;
	};

	const runBulk = async (
		action: BulkLabelMode | 'favorite' | 'unfavorite' | 'delete',
		payload?: { labels?: string[]; force?: boolean }
	) => {
		if (selectedIds.length === 0) return null;
		bulkBusy = true;
		try {
			return await foodService.batch({ ids: selectedIds, action, payload });
		} finally {
			bulkBusy = false;
		}
	};

	const bulkFavorite = async (favorite: boolean) => {
		const result = await runBulk(favorite ? 'favorite' : 'unfavorite');
		if (reportBulk(result)) exitSelection();
	};

	const bulkLabels = async (mode: BulkLabelMode, labels: string[]) => {
		bulkLabelsOpen = false;
		const result = await runBulk(mode, { labels });
		if (reportBulk(result)) exitSelection();
	};

	const bulkDelete = async (force = false) => {
		bulkDeleteOpen = false;
		const result = await runBulk('delete', force ? { force: true } : undefined);
		if (!result) {
			toast.error(m.foods_bulk_failed());
			return;
		}
		// Foods still referenced by diary entries come back untouched, exactly as
		// a single delete does; deleting their entries stays an explicit choice.
		const blocked = result.results.filter((row) => row.error === 'has_entries');
		if (!force && blocked.length > 0) {
			selectedIds = blocked.map((row) => row.id);
			blockedIds = selectedIds;
			toast.success(m.foods_bulk_success({ count: result.succeeded }));
			return;
		}
		blockedIds = [];
		reportBulk(result);
		exitSelection();
		refreshDuplicates();
	};

	const importFoods = async (rows: FoodCsvFood[]) => {
		importing = true;
		try {
			const result = await foodService.importFoods(rows as never[]);
			if (!result) {
				toast.error(m.foods_import_failed());
				return;
			}
			importOpen = false;
			toast.success(m.foods_import_success({ count: result.created }));
			if (result.skipped.length > 0) {
				toast.info(m.foods_import_skipped({ count: result.skipped.length }));
			}
			foodService.refresh();
			refreshDuplicates();
		} finally {
			importing = false;
		}
	};

	const resetFormState = () => {
		showForm = false;
		editingFood = null;
		formImageUrl = null;
		formImageCleared = false;
		offData = null;
		offNotFound = false;
		activeBarcode = '';
		qualityOpen = false;
		if ($page.url.searchParams.has('barcode')) {
			goto('/foods', { replaceState: true });
		}
	};

	const openEdit = async (id: string) => {
		const { data, error } = await foodService.fetchById(id);
		if (error || !data) return;
		resetFormState();
		editingFood = data.food;
		formImageUrl = data.food.imageUrl;
		formImageCleared = false;
		showForm = true;
	};

	const handleImageUpload = async (file: File) => {
		if (uploading) return;
		uploading = true;
		try {
			// Creating: there is no row to attach to yet, so the URL rides along in
			// the create body instead of a PATCH.
			const newUrl = editingFood
				? await uploadImage(file, { type: 'food', id: editingFood.id })
				: await uploadImageFile(file, 'food-create');
			if (newUrl) {
				formImageUrl = newUrl;
				formImageCleared = false;
			}
		} finally {
			uploading = false;
		}
	};

	const handleImageRemove = async () => {
		if (uploading) return;
		// Creating: nothing is attached yet, so dropping the pending URL is the
		// whole removal. The flag also suppresses the scanned OFF image, which
		// would otherwise fill straight back in.
		if (!editingFood) {
			formImageUrl = null;
			formImageCleared = true;
			return;
		}
		uploading = true;
		try {
			if (await removeImage({ type: 'food', id: editingFood.id })) {
				formImageUrl = null;
				formImageCleared = true;
			}
		} finally {
			uploading = false;
		}
	};

	const handleBarcodeScan = (barcode: string) => {
		activeBarcode = barcode;
		fetchFromOFF(barcode);
	};

	async function fetchFromOFF(code: string) {
		if (!code) return;
		offLoading = true;
		offNotFound = false;
		try {
			const { data, error } = await foodService.fetchOffProduct(code);
			if (error || !data) {
				offNotFound = true;
			} else {
				offData = data.product;
			}
		} catch (err) {
			Sentry.captureException(err, { extra: { code } });
			offNotFound = true;
		} finally {
			offLoading = false;
		}
	}

	const prefillFromOff = (product: components['schemas']['OpenFoodFactsProduct']) => {
		resetFormState();
		offData = product;
		activeBarcode = product.barcode;
		showForm = true;
	};

	// Load visible nutrients preference (once)
	$effect(() => {
		if (browser) {
			preferencesService
				.fetchRemote()
				.then(({ data }) => {
					if (data?.preferences?.visibleNutrients?.length) {
						visibleNutrients = data.preferences.visibleNutrients;
					}
				})
				.catch((err) => {
					if (!(browser && !navigator.onLine)) Sentry.captureException(err);
				});
		}
	});

	// "New food" from the command palette.
	$effect(() => {
		if (!consumeQuickAction(['new-food'])) return;
		resetFormState();
		showForm = true;
	});

	$effect(() => {
		if (browser) {
			const urlBarcode = $page.url.searchParams.get('barcode');
			if (urlBarcode && !untrack(() => showForm)) {
				// A dismissed edit form leaves `editingFood`/`formImageUrl` behind,
				// which would turn the scanner's create into an edit of that food.
				resetFormState();
				activeBarcode = urlBarcode;
				fetchFromOFF(urlBarcode);
				showForm = true;
			}
		}
	});

	const formInitial = $derived(
		editingFood
			? {
					name: editingFood.name,
					brand: editingFood.brand ?? '',
					servingSize: editingFood.servingSize,
					servingUnit: editingFood.servingUnit,
					calories: editingFood.calories,
					protein: editingFood.protein,
					carbs: editingFood.carbs,
					fat: editingFood.fat,
					fiber: editingFood.fiber,
					barcode: editingFood.barcode ?? '',
					isFavorite: editingFood.isFavorite,
					nutriScore: editingFood.nutriScore as 'a' | 'b' | 'c' | 'd' | 'e' | null,
					labels: editingFood.labels ?? [],
					...pickNutrients(editingFood)
				}
			: offData
				? {
						name: offData.name,
						brand: offData.brand ?? '',
						servingSize: offData.servingSize ?? 100,
						servingUnit: (offData.servingUnit ?? 'g') as import('$lib/units').ServingUnit,
						calories: offData.calories,
						protein: offData.protein,
						carbs: offData.carbs,
						fat: offData.fat,
						fiber: offData.fiber,
						nutriScore: offData.nutriScore,
						barcode: activeBarcode,
						isFavorite: false,
						...pickNutrients(offData)
					}
				: { barcode: activeBarcode }
	);
</script>

<div class="mx-auto max-w-2xl space-y-4 pb-4">
	{#if !query && duplicateGroups.length > 0}
		<DuplicatesBanner groups={duplicateGroups} onResolve={openMergeFromGroup} />
	{/if}

	{#if !isDismissed('scanning')}
		<HintCard
			id="scanning"
			title={m.hint_scanning_title()}
			text={m.hint_scanning_body()}
			href="/help/scanning"
		/>
	{:else if !isDismissed('food-database')}
		<HintCard
			id="food-database"
			title={m.hint_food_database_title()}
			text={m.hint_food_database_body()}
			href="/help/food-database"
		/>
	{/if}

	<FoodsToolbar
		{selecting}
		onImportCsv={() => (importOpen = true)}
		onImportPackage={() => (packageImportOpen = true)}
		onShare={() => {
			packageExportIds = [];
			packageExportOpen = true;
		}}
		onToggleSelecting={() => (selecting ? exitSelection() : (selecting = true))}
	/>

	<div class="relative">
		<Search
			class="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
		/>
		<Input
			class="w-full min-w-0 pl-9"
			placeholder={m.foods_search_placeholder()}
			bind:value={query}
		/>
	</div>

	{#if query && foods.length === 0 && !offSearchLoading && offResults.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.foods_no_results()}</p>
	{:else}
		<FoodList
			{foods}
			onEdit={openEdit}
			onDelete={deleteFood}
			onEnrich={foodService.enrichFromOff}
			onMerge={openMergeFromMenu}
			{selecting}
			{selectedIds}
			onToggleSelect={toggleSelect}
		/>
	{/if}

	{#if debouncedQuery && (offSearchLoading || offResults.length > 0)}
		<OffSearchResults loading={offSearchLoading} results={offResults} onPick={prefillFromOff} />
	{/if}
</div>

{#if selecting}
	<BulkActionBar
		count={selectedIds.length}
		allSelected={selectedIds.length > 0 && selectedIds.length === foods.length}
		busy={bulkBusy}
		onSelectAll={() => (selectedIds = foods.map((food) => food.id))}
		onClear={() => (selectedIds = [])}
		onFavorite={bulkFavorite}
		onLabels={() => (bulkLabelsOpen = true)}
		onExport={() => {
			packageExportIds = [...selectedIds];
			packageExportOpen = true;
		}}
		onDelete={() => (bulkDeleteOpen = true)}
	/>
{:else}
	<Button
		size="icon"
		class="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-50 size-14 rounded-full shadow-lg md:bottom-6"
		aria-label={m.foods_new()}
		onclick={() => {
			resetFormState();
			showForm = true;
		}}
	>
		<Plus class="size-6" />
	</Button>
{/if}

<BulkLabelsDialog bind:open={bulkLabelsOpen} count={selectedIds.length} onApply={bulkLabels} />

<FoodImportDialog bind:open={importOpen} {importing} onImport={importFoods} />

<FoodPackageImportDialog bind:open={packageImportOpen} onImported={() => refreshDuplicates()} />

<FoodPackageExportDialog bind:open={packageExportOpen} foodIds={packageExportIds} />

<BulkDeleteDialogs
	bind:open={bulkDeleteOpen}
	selectedCount={selectedIds.length}
	blockedCount={blockedIds.length}
	onDelete={() => bulkDelete(false)}
	onForceDelete={() => bulkDelete(true)}
	onCancelBlocked={() => {
		blockedIds = [];
		exitSelection();
	}}
/>

<FoodFormModal
	bind:open={showForm}
	bind:qualityOpen
	{editingFood}
	{offData}
	{offLoading}
	{offNotFound}
	{activeBarcode}
	initial={formInitial}
	imageUrl={formImageCleared ? null : (formImageUrl ?? offData?.imageUrl ?? null)}
	{uploading}
	{visibleNutrients}
	onSave={editingFood ? updateFood : createFood}
	onBarcodeScan={!editingFood ? handleBarcodeScan : undefined}
	onImageUpload={handleImageUpload}
	onImageRemove={handleImageRemove}
/>

<FoodDeleteConflictDialog
	conflict={deleteConflict}
	onConfirm={confirmForceDelete}
	onCancel={() => (deleteConflict = null)}
/>

<MergeFoodDialog
	bind:open={mergeOpen}
	candidates={mergeCandidates}
	allFoods={foods as components['schemas']['Food'][]}
	onClose={() => (mergeOpen = false)}
	onCompleted={onMergeCompleted}
/>
