<script lang="ts">
	import FoodThumbnail from '$lib/components/shared/FoodThumbnail.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Barcode from '@lucide/svelte/icons/barcode';
	import Info from '@lucide/svelte/icons/info';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { MACRO_TEXT_CLASS } from '$lib/utils/colors';
	import * as m from '$lib/paraglide/messages';
	import ResolutionToggle from './ResolutionToggle.svelte';
	import type { FoodConflict, PackageAction } from './foodPackage';

	type Props = {
		conflict: FoodConflict;
		value: PackageAction;
		onChange: (action: PackageAction) => void;
	};

	let { conflict, value, onChange }: Props = $props();

	const reasonLabel = $derived(
		conflict.reason === 'barcode'
			? m.food_package_reason_barcode()
			: conflict.reason === 'name_brand'
				? m.food_package_reason_name()
				: m.food_package_reason_barcode_and_name()
	);

	const macros = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const;
	const differs = (key: (typeof macros)[number]) =>
		conflict.incoming[key] !== conflict.existing[key];
	const servingDiffers = $derived(
		conflict.incoming.servingSize !== conflict.existing.servingSize ||
			conflict.incoming.servingUnit !== conflict.existing.servingUnit
	);
	const macroLabel = (key: (typeof macros)[number]) =>
		key === 'calories' ? 'kcal' : key === 'fiber' ? 'Fi' : key[0].toUpperCase();

	const notes = $derived(
		conflict.notes
			.map((note) => {
				switch (note) {
					case 'replace_changes_history':
						return {
							warn: value === 'replace',
							text: m.food_package_note_history({
								entries: conflict.existing.entryCount,
								recipes: conflict.existing.recipeCount
							})
						};
					case 'replace_unit_blocked':
						return { warn: false, text: m.food_package_note_unit_blocked() };
					case 'barcode_dropped_on_keep_both':
						return value === 'keep_both'
							? { warn: false, text: m.food_package_note_barcode_dropped() }
							: null;
					case 'skip_may_copy_for_recipe':
						return value === 'skip' ? { warn: false, text: m.food_package_note_skip_copy() } : null;
					case 'shared_target':
						return { warn: false, text: m.food_package_note_shared_target() };
				}
			})
			.filter((note) => note !== null)
	);
</script>

{#snippet side(title: string, item: FoodConflict['incoming'], highlight: boolean)}
	<div class="min-w-0 space-y-1.5 rounded-md bg-muted/40 p-2">
		<p class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
		<div class="flex min-w-0 items-center gap-2">
			<FoodThumbnail name={item.name} imageUrl={item.imageUrl} size="sm" />
			<div class="min-w-0">
				<p class="truncate text-sm font-medium">{item.name}</p>
				{#if item.brand}<p class="truncate text-xs text-muted-foreground">{item.brand}</p>{/if}
			</div>
		</div>
		<p
			class="text-xs text-muted-foreground tabular-nums"
			class:font-semibold={highlight && servingDiffers}
		>
			{item.servingSize}
			{item.servingUnit.replace('_', ' ')}
		</p>
		<div class="flex flex-wrap gap-x-2 gap-y-0.5 text-xs tabular-nums">
			{#each macros as key (key)}
				<span class={MACRO_TEXT_CLASS[key]} class:font-semibold={highlight && differs(key)}>
					{item[key]}
					<span class="opacity-70">{macroLabel(key)}</span>
				</span>
			{/each}
		</div>
		{#if item.barcode}
			<p class="flex items-center gap-1 truncate text-xs text-muted-foreground">
				<Barcode class="size-3" />{item.barcode}
			</p>
		{/if}
		{#if item.labels.length > 0}
			<p class="truncate text-xs text-muted-foreground">{item.labels.join(', ')}</p>
		{/if}
	</div>
{/snippet}

<div class="space-y-2 rounded-lg border p-3">
	<div class="flex items-center gap-2">
		<Badge variant="secondary">{reasonLabel}</Badge>
		{#if conflict.alsoMatches.length > 0}
			<span class="truncate text-xs text-muted-foreground">
				{m.food_package_also_matches({
					names: conflict.alsoMatches.map((match) => match.name).join(', ')
				})}
			</span>
		{/if}
	</div>
	<div class="grid gap-2 sm:grid-cols-2">
		{@render side(m.food_package_incoming(), conflict.incoming, true)}
		{@render side(m.food_package_existing(), conflict.existing, false)}
	</div>
	<ResolutionToggle {value} allowed={conflict.allowed} {onChange} />
	{#each notes as note (note.text)}
		<p
			class="flex items-start gap-1.5 text-xs {note.warn
				? 'text-amber-600 dark:text-amber-400'
				: 'text-muted-foreground'}"
		>
			{#if note.warn}
				<TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
			{:else}
				<Info class="mt-0.5 size-3.5 shrink-0" />
			{/if}
			{note.text}
		</p>
	{/each}
</div>
