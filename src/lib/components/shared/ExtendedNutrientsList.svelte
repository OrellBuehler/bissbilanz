<script lang="ts">
	import { ALL_NUTRIENT_KEYS, NUTRIENT_BY_KEY } from '$lib/nutrients';
	import { nutrientLabel } from '$lib/nutrients-i18n';
	import { formatNutrient } from '$lib/utils/number';

	type Props = {
		nutrients: Record<string, number | null | undefined>;
	};

	let { nutrients }: Props = $props();

	const rows = $derived(
		ALL_NUTRIENT_KEYS.map((key) => ({ key, value: nutrients[key] }))
			.filter((row): row is { key: string; value: number } => typeof row.value === 'number')
			.map((row) => {
				const def = NUTRIENT_BY_KEY.get(row.key);
				return {
					key: row.key,
					label: def ? nutrientLabel(def) : row.key,
					value: row.value,
					unit: def?.unit ?? 'g'
				};
			})
	);
</script>

{#if rows.length > 0}
	<ul class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
		{#each rows as row (row.key)}
			<li class="flex items-baseline justify-between gap-2 text-muted-foreground">
				<span class="truncate">{row.label}</span>
				<span class="shrink-0 font-medium text-foreground"
					>{formatNutrient(row.value, row.unit)}</span
				>
			</li>
		{/each}
	</ul>
{/if}
