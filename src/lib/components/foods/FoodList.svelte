<script lang="ts">
	export let foods: Array<{ id: string; name: string; brand?: string | null }> = [];
	export let onEdit: (id: string) => void;
	export let onDelete: (id: string) => void;
</script>

<ul class="space-y-2">
	{#each foods as food}
		<li class="flex items-center justify-between rounded border p-3">
			<div>
				<div class="font-medium">{food.name}</div>
				{#if food.brand}
					<div class="text-sm text-neutral-500">{food.brand}</div>
				{/if}
			</div>
			<div class="flex gap-2">
				<button class="rounded border px-3 py-1" on:click={() => onEdit(food.id)}>Edit</button>
				<button class="rounded border px-3 py-1" on:click={() => onDelete(food.id)}>Delete</button>
			</div>
		</li>
	{/each}
</ul>
