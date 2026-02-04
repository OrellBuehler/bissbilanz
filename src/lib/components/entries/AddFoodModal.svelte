<script lang="ts">
	import { onlyFavorites } from '$lib/utils/favorites';

	export let open = false;
	export let foods: Array<{ id: string; name: string; isFavorite?: boolean }> = [];
	export let mealType = 'Breakfast';
	let query = '';
	let servings = 1;
	let tab: 'search' | 'favorites' | 'recent' = 'search';

	export let onClose: () => void;
	export let onSave: (payload: { foodId: string; mealType: string; servings: number }) => void;

	const filtered = () =>
		foods.filter((food) => food.name.toLowerCase().includes(query.toLowerCase()));

	const handleAdd = (foodId: string) => {
		onSave({ foodId, mealType, servings });
	};
</script>

{#if open}
	<div class="fixed inset-0 z-50 bg-black/40 p-6">
		<div class="mx-auto max-w-lg space-y-4 rounded bg-white p-6">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold">Add Food</h3>
				<button onclick={onClose}>Close</button>
			</div>

			<div class="flex gap-2">
				<button
					class="rounded border px-3 py-1"
					class:bg-black={tab === 'search'}
					class:text-white={tab === 'search'}
					onclick={() => (tab = 'search')}
				>
					Search
				</button>
				<button
					class="rounded border px-3 py-1"
					class:bg-black={tab === 'favorites'}
					class:text-white={tab === 'favorites'}
					onclick={() => (tab = 'favorites')}
				>
					Favorites
				</button>
				<button
					class="rounded border px-3 py-1"
					class:bg-black={tab === 'recent'}
					class:text-white={tab === 'recent'}
					onclick={() => (tab = 'recent')}
				>
					Recent
				</button>
			</div>

			{#if tab === 'search'}
				<input
					class="w-full rounded border p-2"
					placeholder="Search foods..."
					bind:value={query}
				/>
				<ul class="max-h-60 space-y-2 overflow-auto">
					{#each filtered() as food}
						<li class="flex items-center justify-between">
							<span>{food.name}</span>
							<button class="rounded border px-2 py-1" onclick={() => handleAdd(food.id)}>
								Add
							</button>
						</li>
					{/each}
				</ul>
			{:else if tab === 'favorites'}
				<ul class="max-h-60 space-y-2 overflow-auto">
					{#each onlyFavorites(foods) as food}
						<li class="flex items-center justify-between">
							<span>{food.name}</span>
							<button class="rounded border px-2 py-1" onclick={() => handleAdd(food.id)}>
								Add
							</button>
						</li>
					{:else}
						<li class="text-neutral-500">No favorites yet</li>
					{/each}
				</ul>
			{:else if tab === 'recent'}
				<p class="text-neutral-500">Recent foods coming soon</p>
			{/if}

			<label class="grid gap-2">
				<span>Servings</span>
				<input class="rounded border p-2" type="number" bind:value={servings} min="0.1" step="0.1" />
			</label>
		</div>
	</div>
{/if}
