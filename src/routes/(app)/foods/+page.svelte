<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import FoodForm from '$lib/components/foods/FoodForm.svelte';
	import FoodList from '$lib/components/foods/FoodList.svelte';
	import FoodQualityPanel from '$lib/components/quality/FoodQualityPanel.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import { apiFetch } from '$lib/utils/api';
	import { api } from '$lib/api/client';

	import { toast } from 'svelte-sonner';
	import { browser } from '$app/environment';
	import * as Sentry from '@sentry/sveltekit';
	import * as m from '$lib/paraglide/messages';
	import { DEFAULT_VISIBLE_NUTRIENTS, pickNutrients, pickNonNullNutrients } from '$lib/nutrients';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { foodService } from '$lib/services/food-service.svelte';

	let visibleNutrients = $state<string[]>([...DEFAULT_VISIBLE_NUTRIENTS]);
	let query = $state('');
	let showForm = $state(false);
	let editingFood: any | null = $state(null);
	let editImageUrl: string | null = $state(null);
	let uploading = $state(false);

	let offData = $state<any>(null);
	let offLoading = $state(false);
	let offNotFound = $state(false);
	let activeBarcode = $state('');
	let forceDeleteId: string | null = $state(null);
	let forceDeleteCount = $state(0);
	let qualityOpen = $state(false);

	const allFoodsQuery = useLiveQuery(() => foodService.allFoods());
	let searchQuery = $state<ReturnType<typeof useLiveQuery<any[]>> | null>(null);

	const foods = $derived(
		query && searchQuery ? (searchQuery.value ?? []) : (allFoodsQuery.value ?? [])
	);

	$effect(() => {
		if (browser) {
			foodService.refresh();
		}
	});

	let debounceTimer: ReturnType<typeof setTimeout>;

	$effect(() => {
		const q = query;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			if (q) {
				searchQuery = useLiveQuery(() => foodService.search(q));
			} else {
				searchQuery = null;
			}
		}, 300);
	});

	const createFood = async (payload: any) => {
		const body = offData
			? {
					...payload,
					novaGroup: offData.novaGroup,
					additives: offData.additives,
					ingredientsText: offData.ingredientsText,
					imageUrl: offData.imageUrl
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
		closeForm();
		foodService.refresh();
	};

	const updateFood = async (payload: any) => {
		if (!editingFood) return;
		const { error } = await api.PATCH('/api/foods/{id}', {
			params: { path: { id: editingFood.id } },
			body: { ...payload, imageUrl: editImageUrl }
		});
		if (error) {
			if (error.error === 'duplicate_barcode') {
				toast.error(m.detail_duplicate_barcode());
			} else {
				toast.error(m.detail_save_failed());
			}
			return;
		}
		toast.success(m.detail_saved());
		closeForm();
		foodService.refreshById(editingFood.id);
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
		const formData = new FormData();
		formData.append('image', file);
		try {
			const uploadRes = await apiFetch('/api/images/upload', {
				method: 'POST',
				body: formData
			});
			if (!uploadRes.ok) {
				const body = await uploadRes.text().catch(() => '');
				Sentry.logger.error('Image upload failed', {
					status: uploadRes.status,
					body: body.slice(0, 500),
					fileSize: file.size,
					fileType: file.type,
					context: 'food-edit'
				});
				toast.error(m.image_upload_failed());
				return;
			}
			const { imageUrl: newUrl } = await uploadRes.json();
			editImageUrl = newUrl;
			await api.PATCH('/api/foods/{id}', {
				params: { path: { id: editingFood.id } },
				body: { imageUrl: newUrl }
			});
			toast.success(m.image_uploaded());
		} catch (err) {
			Sentry.captureException(err, { extra: { fileSize: file.size, fileType: file.type } });
			toast.error(m.image_upload_failed());
		} finally {
			uploading = false;
		}
	};

	const closeForm = () => {
		resetFormState();
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
			if (urlBarcode && !showForm) {
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
					nutriScore: editingFood.nutriScore,
					...pickNutrients(editingFood)
				}
			: offData
				? {
						name: offData.name,
						brand: offData.brand,
						servingSize: offData.servingSize,
						servingUnit: offData.servingUnit,
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

	{#if query && foods.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.foods_no_results()}</p>
	{:else}
		<FoodList {foods} onEdit={openEdit} onDelete={deleteFood} onEnrich={enrichFood} />
	{/if}
</div>

<Button
	size="icon"
	class="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg"
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
						nutriScore={offData.nutriScore}
						novaGroup={offData.novaGroup}
						additives={offData.additives}
						ingredientsText={offData.ingredientsText}
					/>
				</Collapsible.Content>
			</Collapsible.Root>
		{:else if editingFood}
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
							novaGroup={editingFood.novaGroup}
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

<AlertDialog.Root
	open={forceDeleteId !== null}
	onOpenChange={(open) => {
		if (!open) forceDeleteId = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title class="text-left">{m.delete_related_entries()}</AlertDialog.Title>
			<AlertDialog.Description>
				{@html m.foods_delete_has_entries({ count: forceDeleteCount })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => (forceDeleteId = null)}>
				{m.cancel()}
			</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				onclick={confirmForceDelete}
			>
				<Trash2 class="size-4" />
				{m.delete_related_entries()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
