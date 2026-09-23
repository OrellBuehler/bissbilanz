<script lang="ts">
	import FoodThumbnail from '$lib/components/shared/FoodThumbnail.svelte';
	import MacroChip from '$lib/components/shared/MacroChip.svelte';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import Star from '@lucide/svelte/icons/star';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		name: string;
		imageUrl?: string | null;
		isFavorite?: boolean;
		servings: number;
		macros: { calories: number; protein: number; carbs: number; fat: number };
		fit: number;
		compact?: boolean;
		onTap: () => void;
	};

	let {
		name,
		imageUrl,
		isFavorite = false,
		servings,
		macros,
		fit,
		compact = false,
		onTap
	}: Props = $props();

	const servingsLabel = $derived(`${servings}×`);
</script>

<button
	class="flex w-full items-center gap-3 rounded-xl border bg-card p-2.5 text-left shadow-sm transition-all hover:shadow-md active:scale-[0.99]"
	onclick={onTap}
>
	{#if !compact}
		<div class="relative shrink-0">
			<FoodThumbnail {name} {imageUrl} size="sm" />
			{#if isFavorite}
				<Star class="absolute -top-1 -right-1 size-3.5 fill-amber-400 text-amber-400" />
			{/if}
		</div>
	{/if}
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<p class="truncate text-sm font-medium">{name}</p>
			<span
				class="text-muted-foreground bg-muted shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
			>
				{servingsLabel}
			</span>
		</div>
		{#if compact}
			<MacroChip macro="calories" value={macros.calories} class="mt-1" />
		{:else}
			<div class="mt-1 flex flex-wrap gap-1">
				<MacroChip macro="calories" value={macros.calories} />
				<MacroChip macro="protein" value={macros.protein} />
				<MacroChip macro="carbs" value={macros.carbs} />
				<MacroChip macro="fat" value={macros.fat} />
			</div>
			<div class="mt-1.5 flex items-center gap-2">
				<Progress value={fit} class="h-1.5 flex-1" />
				<span class="text-muted-foreground shrink-0 text-[10px] tabular-nums">
					{m.recipe_suggestions_fit({ percent: String(fit) })}
				</span>
			</div>
		{/if}
	</div>
</button>
