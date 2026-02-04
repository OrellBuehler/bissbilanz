<script lang="ts">
	export let open = false;
	export let foods: Array<{ id: string; name: string }> = [];
	export let mealType = 'Breakfast';
	let query = '';
	let servings = 1;

	export let onClose: () => void;
	export let onSave: (payload: { foodId: string; mealType: string; servings: number }) => void;

	const filtered = () =>
		foods.filter((food) => food.name.toLowerCase().includes(query.toLowerCase()));
</script>

{#if open}
	<div class="fixed inset-0 bg-black/40 p-6">
		<div class="mx-auto max-w-lg space-y-4 rounded bg-white p-6">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold">Add Food</h3>
				<button on:click={onClose}>Close</button>
			</div>
			<input class="rounded border p-2" placeholder="Search" bind:value={query} />
			<ul class="max-h-60 space-y-2 overflow-auto">
				{#each filtered() as food}
					<li class="flex items-center justify-between">
						<span>{food.name}</span>
						<button
							class="rounded border px-2 py-1"
							on:click={() => onSave({ foodId: food.id, mealType, servings })}
						>
							Add
						</button>
					</li>
				{/each}
			</ul>
			<label class="grid gap-2">
				<span>Servings</span>
				<input class="rounded border p-2" type="number" bind:value={servings} />
			</label>
		</div>
	</div>
{/if}
