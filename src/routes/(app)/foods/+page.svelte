<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import FoodForm from '$lib/components/foods/FoodForm.svelte';
	import FoodList from '$lib/components/foods/FoodList.svelte';
	import FoodQualityPanel from '$lib/components/quality/FoodQualityPanel.svelte';
	import { filterFoods } from '$lib/components/foods/foodFilters';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import { apiFetch } from '$lib/utils/api';
	import { toast } from 'svelte-sonner';
	import { browser } from '$app/environment';
	import * as Sentry from '@sentry/sveltekit';
	import * as m from '$lib/paraglide/messages';

	let foods: Array<any> = $state([]);
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

	const loadFoods = async () => {
		const res = await fetch('/api/foods');
		const data = await res.json();
		foods = data.foods;
	};

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
		await apiFetch('/api/foods', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		closeForm();
		await loadFoods();
	};

	const updateFood = async (payload: any) => {
		if (!editingFood) return;
		const res = await apiFetch(`/api/foods/${editingFood.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...payload, imageUrl: editImageUrl })
		});
		if (res.ok) {
			toast.success(m.detail_saved());
		} else {
			toast.error(m.detail_save_failed());
		}
		closeForm();
		await loadFoods();
	};

	const deleteFood = async (id: string) => {
		const res = await apiFetch(`/api/foods/${id}`, { method: 'DELETE' });
		if (res.status === 409) {
			const { entryCount } = await res.json();
			forceDeleteId = id;
			forceDeleteCount = entryCount;
			return;
		}
		await loadFoods();
	};

	const confirmForceDelete = async () => {
		if (!forceDeleteId) return;
		await apiFetch(`/api/foods/${forceDeleteId}?force=true`, { method: 'DELETE' });
		forceDeleteId = null;
		await loadFoods();
	};

	const enrichFood = async (id: string, barcode: string) => {
		const res = await fetch(`/api/openfoodfacts/${barcode}`);
		if (!res.ok) return;
		const { product } = await res.json();
		await apiFetch(`/api/foods/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				nutriScore: product.nutriScore,
				novaGroup: product.novaGroup,
				additives: product.additives,
				ingredientsText: product.ingredientsText,
				imageUrl: product.imageUrl
			})
		});
		await loadFoods();
	};

	const openEdit = async (id: string) => {
		const res = await fetch(`/api/foods/${id}`);
		if (!res.ok) return;
		const data = await res.json();
		editingFood = data.food;
		editImageUrl = data.food.imageUrl;
		offData = null;
		activeBarcode = '';
		showForm = true;
	};

	const handleImageUpload = async (file: File) => {
		if (!editingFood || uploading) return;
		uploading = true;
		const formData = new FormData();
		formData.append('image', file);
		try {
			const uploadRes = await fetch('/api/images/upload', {
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
			await apiFetch(`/api/foods/${editingFood.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ imageUrl: newUrl })
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
		showForm = false;
		editingFood = null;
		editImageUrl = null;
		offData = null;
		offNotFound = false;
		activeBarcode = '';
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
			const res = await fetch(`/api/openfoodfacts/${code}`);
			if (res.ok) {
				offData = (await res.json()).product;
			} else {
				offNotFound = true;
			}
		} catch {
			offNotFound = true;
		} finally {
			offLoading = false;
		}
	}

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

	onMount(() => {
		loadFoods();
	});

	const filtered = $derived(filterFoods(foods, query));

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
					sodium: editingFood.sodium,
					sugar: editingFood.sugar,
					saturatedFat: editingFood.saturatedFat,
					cholesterol: editingFood.cholesterol
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
						sodium: offData.sodium,
						sugar: offData.sugar,
						saturatedFat: offData.saturatedFat,
						cholesterol: offData.cholesterol,
						nutriScore: offData.nutriScore,
						barcode: activeBarcode,
						isFavorite: false
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

	{#if query && filtered.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.foods_no_results()}</p>
	{:else}
		<FoodList foods={filtered} onEdit={openEdit} onDelete={deleteFood} onEnrich={enrichFood} />
	{/if}
</div>

<Button
	size="icon"
	class="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg"
	aria-label={m.foods_new()}
	onclick={() => {
		editingFood = null;
		editImageUrl = null;
		offData = null;
		activeBarcode = '';
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
			<FoodQualityPanel
				nutriScore={offData.nutriScore}
				novaGroup={offData.novaGroup}
				additives={offData.additives}
				ingredientsText={offData.ingredientsText}
			/>
		{:else if editingFood}
			<div class="mb-3">
				<FoodQualityPanel
					novaGroup={editingFood.novaGroup}
					additives={editingFood.additives}
					ingredientsText={editingFood.ingredientsText}
				/>
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
			<AlertDialog.Title>{m.confirm_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.foods_delete_has_entries({ count: forceDeleteCount })}
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
				{m.confirm_delete_title()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
