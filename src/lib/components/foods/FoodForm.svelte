<script lang="ts">
	export let initial = {
		name: '',
		brand: '',
		servingSize: 0,
		servingUnit: 'g',
		calories: 0,
		protein: 0,
		carbs: 0,
		fat: 0,
		fiber: 0
	};
	let form = { ...initial };

	export let onSave: (payload: typeof form) => Promise<void>;
</script>

<div class="grid gap-3">
	<input class="rounded border p-2" placeholder="Name" bind:value={form.name} />
	<input class="rounded border p-2" placeholder="Brand" bind:value={form.brand} />
	<div class="grid grid-cols-2 gap-2">
		<input class="rounded border p-2" type="number" placeholder="Serving size" bind:value={form.servingSize} />
		<input class="rounded border p-2" placeholder="Unit (g, ml, piece)" bind:value={form.servingUnit} />
	</div>
	<div class="grid grid-cols-2 gap-2">
		<input class="rounded border p-2" type="number" placeholder="Calories" bind:value={form.calories} />
		<input class="rounded border p-2" type="number" placeholder="Protein" bind:value={form.protein} />
		<input class="rounded border p-2" type="number" placeholder="Carbs" bind:value={form.carbs} />
		<input class="rounded border p-2" type="number" placeholder="Fat" bind:value={form.fat} />
		<input class="rounded border p-2" type="number" placeholder="Fiber" bind:value={form.fiber} />
	</div>
	<button class="rounded bg-black px-4 py-2 text-white" on:click={() => onSave(form)}>Save</button>
</div>
