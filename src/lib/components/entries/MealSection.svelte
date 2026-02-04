<script lang="ts">
	export let title: string;
	export let entries: Array<{ id: string; name: string; calories: number; servings: number }> = [];
	export let onAdd: () => void;
</script>

<section class="rounded border p-4">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">{title}</h2>
		<button class="rounded border px-3 py-1" on:click={onAdd}>Add Food</button>
	</div>
	<ul class="mt-3 space-y-2">
		{#each entries as entry}
			<li class="flex items-center justify-between text-sm">
				<span>{entry.name}</span>
				<span>{entry.calories * entry.servings} kcal</span>
			</li>
		{/each}
	</ul>
</section>
