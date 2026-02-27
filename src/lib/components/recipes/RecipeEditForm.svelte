<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import Check from '@lucide/svelte/icons/check';
	import { round2 } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';

	type Ingredient = {
		id: string;
		foodId: string;
		quantity: number;
		servingUnit: string;
		sortOrder: number;
	};

	type Props = {
		recipe: {
			id: string;
			name: string;
			totalServings: number;
			isFavorite: boolean;
			imageUrl: string | null;
			ingredients: Ingredient[];
		};
		onSave: (payload: {
			name: string;
			totalServings: number;
			isFavorite: boolean;
			imageUrl: string | null;
		}) => Promise<void>;
		imageUrl?: string | null;
		onImageUpload?: (file: File) => Promise<void>;
	};

	let { recipe, onSave, imageUrl, onImageUpload }: Props = $props();

	// svelte-ignore state_referenced_locally
	let name = $state(recipe.name);
	// svelte-ignore state_referenced_locally
	let totalServings = $state(round2(recipe.totalServings));
	// svelte-ignore state_referenced_locally
	let isFavorite = $state(recipe.isFavorite);
	let saving = $state(false);

	async function handleSave() {
		saving = true;
		try {
			await onSave({ name, totalServings, isFavorite, imageUrl: imageUrl ?? null });
		} finally {
			saving = false;
		}
	}
</script>

<div class="space-y-4">
	{#if onImageUpload}
		<div class="space-y-2">
			<div class="aspect-video w-full overflow-hidden rounded-xl border">
				{#if imageUrl}
					<img src={imageUrl} alt={name} class="h-full w-full object-cover" />
				{:else}
					<div class="flex h-full w-full items-center justify-center bg-muted">
						<span class="text-4xl font-bold text-muted-foreground"
							>{name.charAt(0).toUpperCase()}</span
						>
					</div>
				{/if}
			</div>
			<Label for="recipe-image-upload">{m.image_upload_label()}</Label>
			<input
				id="recipe-image-upload"
				type="file"
				accept="image/*"
				onchange={async (e) => {
					const file = (e.target as HTMLInputElement).files?.[0];
					if (file && onImageUpload) await onImageUpload(file);
				}}
				class="mt-1 block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
			/>
		</div>
	{/if}

	<div class="flex items-center gap-3">
		<Switch bind:checked={isFavorite} />
		<Label>{m.mark_as_favorite()}</Label>
	</div>

	<div class="grid gap-4">
		<div class="grid gap-2">
			<Label for="edit-recipe-name">{m.recipe_form_name()}</Label>
			<Input id="edit-recipe-name" bind:value={name} />
		</div>
		<div class="grid gap-2">
			<Label for="edit-recipe-servings">{m.recipe_form_servings()}</Label>
			<Input id="edit-recipe-servings" type="number" bind:value={totalServings} min="1" step="1" />
		</div>
	</div>

	{#if recipe.ingredients.length > 0}
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-base">{m.detail_ingredients()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<ul class="space-y-1 text-sm">
					{#each recipe.ingredients as ingredient}
						<li class="text-muted-foreground">
							{round2(ingredient.quantity)}
							{ingredient.servingUnit}
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/if}

	<Button class="w-full" onclick={handleSave} disabled={saving}>
		<Check class="size-4" />
		{saving ? m.detail_saving() : m.save_changes()}
	</Button>
</div>
