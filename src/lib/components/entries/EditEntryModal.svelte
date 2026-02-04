<script lang="ts">
	export let open = false;
	export let entry: { id: string; servings: number; mealType: string; foodName?: string } | null =
		null;
	export let onClose: () => void;
	export let onSave: (payload: { id: string; servings: number; mealType: string }) => void;
	export let onDelete: (id: string) => void;

	let editServings = 1;
	let editMealType = '';

	$effect(() => {
		if (entry) {
			editServings = entry.servings;
			editMealType = entry.mealType;
		}
	});

	const handleSave = () => {
		if (entry) {
			onSave({ id: entry.id, servings: editServings, mealType: editMealType });
		}
	};

	const handleDelete = () => {
		if (entry) {
			onDelete(entry.id);
		}
	};
</script>

{#if open && entry}
	<div class="fixed inset-0 z-50 bg-black/40 p-6">
		<div class="mx-auto max-w-md space-y-4 rounded bg-white p-6">
			<h3 class="text-lg font-semibold">Edit Entry</h3>
			{#if entry.foodName}
				<p class="text-neutral-600">{entry.foodName}</p>
			{/if}
			<label class="grid gap-2">
				<span>Servings</span>
				<input
					class="rounded border p-2"
					type="number"
					bind:value={editServings}
					min="0.1"
					step="0.1"
				/>
			</label>
			<label class="grid gap-2">
				<span>Meal</span>
				<select class="rounded border p-2" bind:value={editMealType}>
					<option value="Breakfast">Breakfast</option>
					<option value="Lunch">Lunch</option>
					<option value="Dinner">Dinner</option>
					<option value="Snacks">Snacks</option>
				</select>
			</label>
			<div class="flex justify-between">
				<button class="rounded border border-red-500 px-3 py-1 text-red-500" onclick={handleDelete}>
					Delete
				</button>
				<div class="flex gap-2">
					<button class="rounded border px-3 py-1" onclick={onClose}>Cancel</button>
					<button class="rounded bg-black px-3 py-1 text-white" onclick={handleSave}>Save</button>
				</div>
			</div>
		</div>
	</div>
{/if}
