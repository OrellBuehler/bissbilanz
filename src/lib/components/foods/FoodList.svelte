<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	type Props = {
		foods?: Array<{ id: string; name: string; brand?: string | null }>;
		onEdit: (id: string) => void;
		onDelete: (id: string) => void;
	};

	let { foods = [], onEdit, onDelete }: Props = $props();
</script>

<ul class="space-y-2">
	{#each foods as food}
		<Card.Root class="flex items-center justify-between p-3">
			<div>
				<div class="font-medium">{food.name}</div>
				{#if food.brand}
					<div class="text-sm text-muted-foreground">{food.brand}</div>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={() => onEdit(food.id)}>Edit</Button>
				<Button variant="outline" size="sm" onclick={() => onDelete(food.id)}>Delete</Button>
			</div>
		</Card.Root>
	{/each}
</ul>
