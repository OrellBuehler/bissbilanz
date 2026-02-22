<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { apiFetch } from '$lib/utils/api';
	import { toast } from 'svelte-sonner';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import * as m from '$lib/paraglide/messages';

	type Ingredient = {
		id: string;
		foodId: string;
		quantity: number;
		servingUnit: string;
		sortOrder: number;
	};

	type Recipe = {
		id: string;
		name: string;
		totalServings: number;
		isFavorite: boolean;
		imageUrl: string | null;
		ingredients: Ingredient[];
	};

	let recipe: Recipe | null = $state(null);
	let loading = $state(true);
	let saving = $state(false);

	let name = $state('');
	let totalServings = $state(1);
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

	const loadRecipe = async () => {
		const id = $page.params.id;
		try {
			const res = await fetch(`/api/recipes/${id}`);
			if (!res.ok) {
				goto('/recipes');
				return;
			}
			const data = await res.json();
			recipe = data.recipe;
			if (recipe) {
				name = recipe.name;
				totalServings = recipe.totalServings;
				isFavorite = recipe.isFavorite;
				imageUrl = recipe.imageUrl;
			}
		} catch {
			goto('/recipes');
		} finally {
			loading = false;
		}
	};

	const handleImageUpload = async (e: Event) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !recipe) return;

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

			await apiFetch(`/api/recipes/${recipe.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ imageUrl: newUrl })
			});
		} catch {
			// silently ignore
		}
	};

	const toggleFavorite = async () => {
		if (!recipe) return;
		isFavorite = !isFavorite;
		await apiFetch(`/api/recipes/${recipe.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ isFavorite })
		});
	};

	const saveChanges = async () => {
		if (!recipe) return;
		saving = true;
		try {
			const res = await apiFetch(`/api/recipes/${recipe.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name,
					totalServings,
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
		loadRecipe();
	});
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="sm" href="/recipes">
			<ArrowLeft class="mr-1 size-4" />
			{m.back_to_recipes()}
		</Button>
	</div>

	{#if loading}
		<p class="text-muted-foreground">{m.favorites_loading()}</p>
	{:else if recipe}
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
				<Label for="recipe-name">{m.recipe_form_name()}</Label>
				<Input id="recipe-name" bind:value={name} />
			</div>
			<div class="grid gap-2">
				<Label for="recipe-servings">{m.recipe_form_servings()}</Label>
				<Input id="recipe-servings" type="number" bind:value={totalServings} min="1" step="1" />
			</div>
		</div>

		<!-- Ingredients (read-only) -->
		{#if recipe.ingredients.length > 0}
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-base">{m.detail_ingredients()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<ul class="space-y-1 text-sm">
						{#each recipe.ingredients as ingredient}
							<li class="text-muted-foreground">
								{ingredient.quantity}
								{ingredient.servingUnit}
							</li>
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>
		{/if}

		<Button onclick={saveChanges} disabled={saving}>
			{saving ? m.detail_saving() : m.save_changes()}
		</Button>
	{/if}
</div>
