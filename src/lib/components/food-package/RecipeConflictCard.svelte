<script lang="ts">
	import FoodThumbnail from '$lib/components/shared/FoodThumbnail.svelte';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Info from '@lucide/svelte/icons/info';
	import * as m from '$lib/paraglide/messages';
	import ResolutionToggle from './ResolutionToggle.svelte';
	import type { PackageAction, RecipeConflict } from './foodPackage';

	type Props = {
		conflict: RecipeConflict;
		value: PackageAction;
		onChange: (action: PackageAction) => void;
	};

	let { conflict, value, onChange }: Props = $props();
</script>

{#snippet side(title: string, item: RecipeConflict['incoming'])}
	<div class="min-w-0 space-y-1.5 rounded-md bg-muted/40 p-2">
		<p class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
		<div class="flex min-w-0 items-center gap-2">
			<FoodThumbnail name={item.name} imageUrl={item.imageUrl} size="sm" />
			<p class="truncate text-sm font-medium">{item.name}</p>
		</div>
		<p class="text-xs text-muted-foreground">
			{m.food_package_ingredients({ count: item.ingredients.length })}
		</p>
		<p class="line-clamp-2 text-xs text-muted-foreground">{item.ingredients.join(', ')}</p>
	</div>
{/snippet}

<div class="space-y-2 rounded-lg border p-3">
	<div class="grid gap-2 sm:grid-cols-2">
		{@render side(m.food_package_incoming(), conflict.incoming)}
		{@render side(m.food_package_existing(), conflict.existing)}
	</div>
	<ResolutionToggle {value} allowed={conflict.allowed} {onChange} />
	{#if conflict.notes.includes('replace_changes_history')}
		<p
			class="flex items-start gap-1.5 text-xs {value === 'replace'
				? 'text-amber-600 dark:text-amber-400'
				: 'text-muted-foreground'}"
		>
			<TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
			{m.food_package_note_recipe_history({ entries: conflict.existing.entryCount })}
		</p>
	{/if}
	{#if conflict.notes.includes('shared_target')}
		<p class="flex items-start gap-1.5 text-xs text-muted-foreground">
			<Info class="mt-0.5 size-3.5 shrink-0" />
			{m.food_package_note_shared_target()}
		</p>
	{/if}
</div>
