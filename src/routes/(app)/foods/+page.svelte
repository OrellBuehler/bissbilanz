<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { untrack } from 'svelte';
	import FoodForm from '$lib/components/foods/FoodForm.svelte';
	import FoodList from '$lib/components/foods/FoodList.svelte';
	import FoodQualityPanel from '$lib/components/quality/FoodQualityPanel.svelte';
	import MergeFoodDialog from '$lib/components/foods/MergeFoodDialog.svelte';
	import DuplicatesBanner from '$lib/components/foods/DuplicatesBanner.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import ForceDeleteDialog from '$lib/components/ui/force-delete-dialog.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import { api } from '$lib/api/client';
	import type { components } from '$lib/api/generated/schema';

	import { toast } from 'svelte-sonner';
	import { browser } from '$app/environment';
	import * as m from '$lib/paraglide/messages';
	import { uploadImage } from '$lib/utils/image-upload';
	import { DEFAULT_VISIBLE_NUTRIENTS, pickNutrients, pickNonNullNutrients } from '$lib/nutrients';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { foodService } from '$lib/services/food-service.svelte';

	let visibleNutrients = $state<string[]>([...DEFAULT_VISIBLE_NUTRIENTS]);
	let query = $state('');
	let showForm = $state(false);
	let editingFood = $state<components['schemas']['Food'] | null>(null);
	let editImageUrl: string | null = $state(null);
	let uploading = $state(false);

	let offData = $state<components['schemas']['OpenFoodFactsProduct'] | null>(null);
	let offLoading = $state(false);
	let offNotFound = $state(false);
	let activeBarcode = $state('');
	let offResults = $state<components['schemas']['OpenFoodFactsProduct'][]>([]);
	let offSearchLoading = $state(false);
	// Below this many local matches, offer Open Food Facts results to fill the gap.
	const OFF_FALLBACK_THRESHOLD = 5;
	let forceDeleteId: string | null = $state(null);
	let forceDeleteCount = $state(0);
	let qualityOpen = $state(false);

	let mergeOpen = $state(false);
	let mergeCandidates = $state<components['schemas']['Food'][]>([]);
	let duplicateGroups = $state<components['schemas']['FoodDuplicateGroup'][]>([]);

	const refreshDuplicates = async () => {
		try {
			const { data } = await api.GET('/api/foods/duplicates');
			if (data) duplicateGroups = data.groups;
		} catch {
			duplicateGroups = [];
		}
	};

	const openMergeFromMenu = async (id: string) => {
		const { data } = await api.GET('/api/foods/{id}', { params: { path: { id } } });
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
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debouncedQuery = q;
		}, 300);
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
		api
			.GET('/api/openfoodfacts/search', { params: { query: { q } } })
			.then(({ data }) => {
				if (!cancelled) offResults = data?.results ?? [];
			})
			.catch(() => {
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
			const { error } = await api.POST('/api/foods', { body });
			if (error) {
				if (error.error === 'duplicate_barcode') {
					toast.error(m.detail_duplicate_barcode());
				} else {
					toast.error(m.detail_create_failed());
				}
				return;
			}
		} catch {
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
		const { error } = await api.PATCH('/api/foods/{id}', {
			params: { path: { id: editingFood.id } },
			body: { ...fields, imageUrl: editImageUrl }
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
		const before = editingFood.labels ?? [];
		if (
			labels &&
			(labels.length !== before.length || labels.some((label, i) => label !== before[i]))
		) {
			const { error: labelError } = await api.PUT('/api/foods/{id}/labels', {
				params: { path: { id: editingFood.id } },
				body: { labels }
			});
			if (labelError) {
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
		const { error, response } = await api.DELETE('/api/foods/{id}', {
			params: { path: { id } }
		});
		if (response.status === 409 && error) {
			forceDeleteId = id;
			forceDeleteCount = (error as { entryCount?: number }).entryCount ?? 0;
			return;
		}
		foodService.refresh();
	};

	const confirmForceDelete = async () => {
		if (!forceDeleteId) return;
		await api.DELETE('/api/foods/{id}', {
			params: { path: { id: forceDeleteId }, query: { force: true } }
		});
		forceDeleteId = null;
		foodService.refresh();
	};

	const enrichFood = async (id: string, barcode: string) => {
		const { data, error } = await api.GET('/api/openfoodfacts/{barcode}', {
			params: { path: { barcode } }
		});
		if (error || !data) return;
		const { product } = data;
		await api.PATCH('/api/foods/{id}', {
			params: { path: { id } },
			body: {
				nutriScore: product.nutriScore,
				novaGroup: product.novaGroup,
				additives: product.additives,
				ingredientsText: product.ingredientsText,
				imageUrl: product.imageUrl,
				...pickNonNullNutrients(product)
			}
		});
		foodService.refreshById(id);
	};

	const resetFormState = () => {
		showForm = false;
		editingFood = null;
		editImageUrl = null;
		offData = null;
		offNotFound = false;
		activeBarcode = '';
		qualityOpen = false;
		if ($page.url.searchParams.has('barcode')) {
			goto('/foods', { replaceState: true });
		}
	};

	const openEdit = async (id: string) => {
		const { data, error } = await api.GET('/api/foods/{id}', {
			params: { path: { id } }
		});
		if (error || !data) return;
		resetFormState();
		editingFood = data.food;
		editImageUrl = data.food.imageUrl;
		showForm = true;
	};

	const handleImageUpload = async (file: File) => {
		if (!editingFood || uploading) return;
		uploading = true;
		try {
			const newUrl = await uploadImage(file, { type: 'food', id: editingFood.id });
			if (newUrl) editImageUrl = newUrl;
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
			const { data, error } = await api.GET('/api/openfoodfacts/{barcode}', {
				params: { path: { barcode: code } }
			});
			if (error || !data) {
				offNotFound = true;
			} else {
				offData = data.product;
			}
		} catch {
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
			api
				.GET('/api/preferences')
				.then(({ data }) => {
					if (data?.preferences?.visibleNutrients?.length) {
						visibleNutrients = data.preferences.visibleNutrients;
					}
				})
				.catch(() => {});
		}
	});

	$effect(() => {
		if (browser) {
			const urlBarcode = $page.url.searchParams.get('barcode');
			if (urlBarcode && !untrack(() => showForm)) {
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
			onEnrich={enrichFood}
			onMerge={openMergeFromMenu}
		/>
	{/if}

	{#if debouncedQuery && (offSearchLoading || offResults.length > 0)}
		<div class="space-y-2">
			<p class="text-muted-foreground text-xs font-medium">{m.add_food_off_section()}</p>
			{#if offSearchLoading}
				<p class="text-muted-foreground text-sm">{m.add_food_off_searching()}</p>
			{:else}
				<ul class="space-y-2">
					{#each offResults as product (product.barcode)}
						<li class="flex min-w-0 items-center justify-between gap-2 rounded-md border p-2">
							<span class="min-w-0 flex-1 truncate text-sm">
								{product.name}
								{#if product.brand}<span class="text-muted-foreground">
										· {product.brand}</span
									>{/if}
							</span>
							<Button
								variant="outline"
								size="sm"
								class="shrink-0"
								aria-label={m.add_food_add()}
								onclick={() => prefillFromOff(product)}
							>
								<Plus class="size-4 sm:mr-1" />
								<span class="hidden sm:inline">{m.add_food_add()}</span>
							</Button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

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

<ResponsiveModal
	bind:open={showForm}
	title={editingFood ? m.food_form_name() : m.foods_new()}
	description={editingFood ? editingFood.name : m.foods_new_description()}
>
	{#if offLoading}
		<p class="text-sm text-muted-foreground">{m.quality_off_loading()}</p>
	{:else}
		{#if offNotFound && activeBarcode}
			<p class="mb-3 text-sm text-amber-600">{m.quality_off_not_found()}</p>
		{:else if offData && !editingFood}
			<p class="mb-3 text-sm text-green-600">{m.quality_off_prefilled()}</p>
			<Collapsible.Root bind:open={qualityOpen}>
				<Collapsible.Trigger
					class="flex w-full items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
				>
					<ChevronDown class="size-4 transition-transform [[data-state=closed]_&]:-rotate-90" />
					{m.quality_title()}
				</Collapsible.Trigger>
				<Collapsible.Content>
					<FoodQualityPanel
						nutriScore={offData.nutriScore as 'a' | 'b' | 'c' | 'd' | 'e' | null}
						novaGroup={offData.novaGroup as 1 | 2 | 3 | 4 | null}
						additives={offData.additives}
						ingredientsText={offData.ingredientsText}
					/>
				</Collapsible.Content>
			</Collapsible.Root>
		{:else if editingFood && (editingFood.novaGroup || (editingFood.additives?.length ?? 0) > 0 || editingFood.ingredientsText)}
			<div class="mb-3">
				<Collapsible.Root bind:open={qualityOpen}>
					<Collapsible.Trigger
						class="flex w-full items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
					>
						<ChevronDown class="size-4 transition-transform [[data-state=closed]_&]:-rotate-90" />
						{m.quality_title()}
					</Collapsible.Trigger>
					<Collapsible.Content>
						<FoodQualityPanel
							novaGroup={editingFood.novaGroup as 1 | 2 | 3 | 4 | null}
							additives={editingFood.additives}
							ingredientsText={editingFood.ingredientsText}
						/>
					</Collapsible.Content>
				</Collapsible.Root>
			</div>
		{/if}
		{#key editingFood?.id ?? offData ?? activeBarcode}
			<FoodForm
				initial={formInitial}
				onSave={editingFood ? updateFood : createFood}
				onBarcodeScan={!editingFood ? handleBarcodeScan : undefined}
				imageUrl={editingFood ? editImageUrl : undefined}
				onImageUpload={editingFood ? handleImageUpload : undefined}
				{uploading}
				{visibleNutrients}
			/>
		{/key}
	{/if}
</ResponsiveModal>

<ForceDeleteDialog
	open={forceDeleteId !== null}
	count={forceDeleteCount}
	description={m.foods_delete_has_entries({ count: forceDeleteCount })}
	onConfirm={confirmForceDelete}
	onCancel={() => (forceDeleteId = null)}
/>

<MergeFoodDialog
	bind:open={mergeOpen}
	candidates={mergeCandidates}
	allFoods={foods as components['schemas']['Food'][]}
	onClose={() => (mergeOpen = false)}
	onCompleted={onMergeCompleted}
/>
