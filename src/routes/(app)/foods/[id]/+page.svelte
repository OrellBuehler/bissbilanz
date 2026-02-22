<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { apiFetch } from '$lib/utils/api';
	import { toast } from 'svelte-sonner';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import * as m from '$lib/paraglide/messages';

	type Food = {
		id: string;
		name: string;
		brand: string | null;
		servingSize: number;
		servingUnit: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
		isFavorite: boolean;
		imageUrl: string | null;
		barcode: string | null;
	};

	let food: Food | null = $state(null);
	let loading = $state(true);
	let saving = $state(false);

	// Editable fields
	let name = $state('');
	let brand = $state('');
	let servingSize = $state(0);
	let calories = $state(0);
	let protein = $state(0);
	let carbs = $state(0);
	let fat = $state(0);
	let fiber = $state(0);
	let isFavorite = $state(false);
	let imageUrl: string | null = $state(null);

	const PALETTE = [
		{ bg: 'bg-rose-200', text: 'text-rose-700' },
		{ bg: 'bg-sky-200', text: 'text-sky-700' },
		{ bg: 'bg-amber-200', text: 'text-amber-700' },
		{ bg: 'bg-emerald-200', text: 'text-emerald-700' },
		{ bg: 'bg-violet-200', text: 'text-violet-700' },
		{ bg: 'bg-orange-200', text: 'text-orange-700' },
		{ bg: 'bg-teal-200', text: 'text-teal-700' },
		{ bg: 'bg-pink-200', text: 'text-pink-700' }
	];

	const colorIndex = $derived(
		name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % PALETTE.length
	);
	const placeholderColor = $derived(PALETTE[colorIndex]);
	const initial = $derived(name.charAt(0).toUpperCase());

	const loadFood = async () => {
		const id = $page.params.id;
		try {
			const res = await fetch(`/api/foods/${id}`);
			if (!res.ok) {
				goto('/foods');
				return;
			}
			const data = await res.json();
			food = data.food;
			if (food) {
				name = food.name;
				brand = food.brand ?? '';
				servingSize = food.servingSize;
				calories = food.calories;
				protein = food.protein;
				carbs = food.carbs;
				fat = food.fat;
				fiber = food.fiber;
				isFavorite = food.isFavorite;
				imageUrl = food.imageUrl;
			}
		} catch {
			goto('/foods');
		} finally {
			loading = false;
		}
	};

	const handleImageUpload = async (e: Event) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !food) return;

		const formData = new FormData();
		formData.append('image', file);

		try {
			const uploadRes = await fetch('/api/images/upload', {
				method: 'POST',
				body: formData
			});
			if (!uploadRes.ok) return;
			const { imageUrl: newUrl } = await uploadRes.json();
			imageUrl = newUrl;

			await apiFetch(`/api/foods/${food.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ imageUrl: newUrl })
			});
		} catch {
			// silently ignore
		}
	};

	const toggleFavorite = async () => {
		if (!food) return;
		isFavorite = !isFavorite;
		await apiFetch(`/api/foods/${food.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ isFavorite })
		});
	};

	const saveChanges = async () => {
		if (!food) return;
		saving = true;
		try {
			const res = await apiFetch(`/api/foods/${food.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name,
					brand: brand || null,
					servingSize,
					calories,
					protein,
					carbs,
					fat,
					fiber,
					isFavorite,
					imageUrl
				})
			});
			if (res.ok) {
				toast.success(m.detail_saved());
			} else {
				toast.error(m.detail_save_failed());
			}
		} catch {
			toast.error(m.detail_save_failed());
		} finally {
			saving = false;
		}
	};

	onMount(() => {
		loadFood();
	});
</script>

<div class="mx-auto max-w-2xl space-y-6 pb-6">
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="sm" class="shrink-0" href="/foods" aria-label={m.back_to_foods()}>
			<ArrowLeft class="size-4 sm:mr-1" />
			<span class="hidden sm:inline">{m.back_to_foods()}</span>
		</Button>
	</div>

	{#if loading}
		<p class="text-muted-foreground">{m.favorites_loading()}</p>
	{:else if food}
		<!-- Image section -->
		<div class="aspect-video w-full max-w-sm overflow-hidden rounded-xl border">
			{#if imageUrl}
				<img src={imageUrl} alt={name} class="h-full w-full object-cover" />
			{:else}
				<div class="flex h-full w-full items-center justify-center {placeholderColor.bg}">
					<span class="text-6xl font-bold {placeholderColor.text}">{initial}</span>
				</div>
			{/if}
		</div>
		<div>
			<Label for="image-upload">{m.image_upload_label()}</Label>
			<input
				id="image-upload"
				type="file"
				accept="image/*"
				onchange={handleImageUpload}
				class="mt-1 block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
			/>
		</div>

		<!-- Favorite toggle -->
		<div class="flex items-center gap-3">
			<Switch checked={isFavorite} onCheckedChange={toggleFavorite} />
			<Label>{m.mark_as_favorite()}</Label>
		</div>

		<!-- Editable fields -->
		<div class="grid gap-4">
			<div class="grid gap-2">
				<Label for="food-name">{m.food_form_name()}</Label>
				<Input id="food-name" bind:value={name} />
			</div>
			<div class="grid gap-2">
				<Label for="food-brand">{m.food_form_brand()}</Label>
				<Input id="food-brand" bind:value={brand} />
			</div>
			<div class="grid gap-2">
				<Label for="food-serving">{m.food_form_serving_size()}</Label>
				<Input id="food-serving" type="number" bind:value={servingSize} min="0" step="0.1" />
			</div>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div class="grid gap-2">
					<Label for="food-calories">{m.food_form_calories()}</Label>
					<Input id="food-calories" type="number" bind:value={calories} min="0" step="0.1" />
				</div>
				<div class="grid gap-2">
					<Label for="food-protein">{m.food_form_protein()}</Label>
					<Input id="food-protein" type="number" bind:value={protein} min="0" step="0.1" />
				</div>
				<div class="grid gap-2">
					<Label for="food-carbs">{m.food_form_carbs()}</Label>
					<Input id="food-carbs" type="number" bind:value={carbs} min="0" step="0.1" />
				</div>
				<div class="grid gap-2">
					<Label for="food-fat">{m.food_form_fat()}</Label>
					<Input id="food-fat" type="number" bind:value={fat} min="0" step="0.1" />
				</div>
				<div class="grid gap-2">
					<Label for="food-fiber">{m.food_form_fiber()}</Label>
					<Input id="food-fiber" type="number" bind:value={fiber} min="0" step="0.1" />
				</div>
			</div>
		</div>

		<Button class="w-full sm:w-auto" onclick={saveChanges} disabled={saving}>
			{saving ? m.detail_saving() : m.save_changes()}
		</Button>
	{/if}
</div>
