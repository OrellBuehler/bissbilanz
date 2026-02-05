<script lang="ts">
	import { formatEntryLabel } from '$lib/utils/entries-ui';

	type Props = {
		title: string;
		entries?: Array<{
			id: string;
			foodName?: string | null;
			calories: number | null;
			servings: number;
			mealType: string;
		}>;
		readonly?: boolean;
		onAdd?: () => void;
		onEdit?: (entry: { id: string; servings: number; mealType: string; foodName?: string }) => void;
	};

	let { title, entries = [], readonly = false, onAdd, onEdit }: Props = $props();
</script>

<section class="rounded border p-4">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">{title}</h2>
		{#if !readonly && onAdd}
			<button class="rounded border px-3 py-1" onclick={onAdd}>Add Food</button>
		{/if}
	</div>
	<ul class="mt-3 space-y-2">
		{#each entries as entry}
			<li class="flex items-center justify-between text-sm">
				{#if readonly}
					<span>{formatEntryLabel(entry.foodName ?? 'Unknown', entry.servings)}</span>
				{:else}
					<button
						class="text-left hover:underline"
						onclick={() =>
							onEdit?.({
								id: entry.id,
								servings: entry.servings,
								mealType: entry.mealType,
								foodName: entry.foodName ?? undefined
							})}
					>
						{formatEntryLabel(entry.foodName ?? 'Unknown', entry.servings)}
					</button>
				{/if}
				<span class="text-neutral-500"
					>{Math.round((entry.calories ?? 0) * entry.servings)} kcal</span
				>
			</li>
		{:else}
			<li class="text-sm text-neutral-400">No entries</li>
		{/each}
	</ul>
</section>
