<script lang="ts">
	type Props = {
		foods?: Array<{ id: string; name: string; brand?: string | null }>;
		onEdit: (id: string) => void;
		onDelete: (id: string) => void;
	};

	let { foods = [], onEdit, onDelete }: Props = $props();
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
				<button class="rounded border px-3 py-1" onclick={() => onEdit(food.id)}>Edit</button>
				<button class="rounded border px-3 py-1" onclick={() => onDelete(food.id)}>Delete</button>
			</div>
		</li>
	{/each}
</ul>
