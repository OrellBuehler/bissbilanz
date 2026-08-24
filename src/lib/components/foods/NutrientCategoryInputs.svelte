<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import NumberInput from '$lib/components/shared/NumberInput.svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { CATEGORY_ORDER, NUTRIENTS_BY_CATEGORY, DEFAULT_VISIBLE_NUTRIENTS } from '$lib/nutrients';
	import { nutrientLabel, categoryLabel } from '$lib/nutrients-i18n';
	import { untrack } from 'svelte';

	type Props = {
		values: Record<string, number | null | undefined>;
		onChange: (key: string, value: number | null) => void;
		visibleNutrients?: string[];
		idPrefix?: string;
	};

	let {
		values,
		onChange,
		visibleNutrients = DEFAULT_VISIBLE_NUTRIENTS,
		idPrefix = ''
	}: Props = $props();

	let openCategories = $state<Record<string, boolean>>(
		Object.fromEntries(CATEGORY_ORDER.map((cat) => [cat, false]))
	);

	let visibleSet = $derived(new Set(visibleNutrients));

	let visibleCategories = $derived(
		CATEGORY_ORDER.filter((cat) => NUTRIENTS_BY_CATEGORY[cat].some((n) => visibleSet.has(n.key)))
	);

	// Auto-expand categories that have pre-filled data (one-time on mount)
	$effect(() => {
		untrack(() => {
			for (const cat of CATEGORY_ORDER) {
				const hasData = NUTRIENTS_BY_CATEGORY[cat].some((n) => {
					const val = values[n.key];
					return val != null && val !== 0;
				});
				if (hasData && !openCategories[cat]) {
					openCategories[cat] = true;
				}
			}
		});
	});
</script>

{#each visibleCategories as category}
	{@const nutrients = NUTRIENTS_BY_CATEGORY[category].filter((n) => visibleSet.has(n.key))}
	{#if nutrients.length > 0}
		<Collapsible.Root bind:open={openCategories[category]}>
			<Collapsible.Trigger
				class="flex w-full items-center justify-start gap-2 rounded-md px-2 py-1 text-sm font-medium hover:bg-accent"
			>
				{#if openCategories[category]}
					<ChevronDown class="size-3.5" />
				{:else}
					<ChevronRight class="size-3.5" />
				{/if}
				{categoryLabel(category)}
			</Collapsible.Trigger>
			<Collapsible.Content>
				<div class="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2">
					{#each nutrients as nutrient}
						<div class="grid gap-1.5">
							<Label for={idPrefix + nutrient.key}>{nutrientLabel(nutrient)}</Label>
							<NumberInput
								id={idPrefix + nutrient.key}
								bind:value={
									() => (values[nutrient.key] ?? null) as number | null,
									(v) => onChange(nutrient.key, v)
								}
							/>
						</div>
					{/each}
				</div>
			</Collapsible.Content>
		</Collapsible.Root>
	{/if}
{/each}
