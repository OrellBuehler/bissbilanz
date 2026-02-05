<script lang="ts">
	type FoodFormData = {
		name: string;
		brand: string;
		servingSize: number;
		servingUnit: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
		sodium?: number | null;
		sugar?: number | null;
		saturatedFat?: number | null;
		cholesterol?: number | null;
		barcode: string;
		isFavorite: boolean;
	};

	type Props = {
		initial?: Partial<FoodFormData>;
		onSave: (payload: FoodFormData) => Promise<void>;
	};

	let { initial = {}, onSave }: Props = $props();

	let showAdvanced = $state(false);

	let form = $state<FoodFormData>({
		name: initial.name ?? '',
		brand: initial.brand ?? '',
		servingSize: initial.servingSize ?? 0,
		servingUnit: initial.servingUnit ?? 'g',
		calories: initial.calories ?? 0,
		protein: initial.protein ?? 0,
		carbs: initial.carbs ?? 0,
		fat: initial.fat ?? 0,
		fiber: initial.fiber ?? 0,
		sodium: initial.sodium ?? null,
		sugar: initial.sugar ?? null,
		saturatedFat: initial.saturatedFat ?? null,
		cholesterol: initial.cholesterol ?? null,
		barcode: initial.barcode ?? '',
		isFavorite: initial.isFavorite ?? false
	});
</script>

<div class="grid gap-3">
	<input class="rounded border p-2" placeholder="Name" bind:value={form.name} />
	<input class="rounded border p-2" placeholder="Brand" bind:value={form.brand} />
	<input class="rounded border p-2" placeholder="Barcode" bind:value={form.barcode} />
	<div class="grid grid-cols-2 gap-2">
		<input
			class="rounded border p-2"
			type="number"
			placeholder="Serving size"
			bind:value={form.servingSize}
		/>
		<input
			class="rounded border p-2"
			placeholder="Unit (g, ml, piece)"
			bind:value={form.servingUnit}
		/>
	</div>
	<div class="grid grid-cols-2 gap-2">
		<input
			class="rounded border p-2"
			type="number"
			placeholder="Calories"
			bind:value={form.calories}
		/>
		<input
			class="rounded border p-2"
			type="number"
			placeholder="Protein"
			bind:value={form.protein}
		/>
		<input class="rounded border p-2" type="number" placeholder="Carbs" bind:value={form.carbs} />
		<input class="rounded border p-2" type="number" placeholder="Fat" bind:value={form.fat} />
		<input class="rounded border p-2" type="number" placeholder="Fiber" bind:value={form.fiber} />
	</div>

	<button
		type="button"
		class="text-left text-sm text-neutral-500 hover:text-neutral-700"
		onclick={() => (showAdvanced = !showAdvanced)}
	>
		{showAdvanced ? '▼' : '▶'} Advanced Nutrients
	</button>

	{#if showAdvanced}
		<div class="grid grid-cols-2 gap-2 rounded border p-3">
			<input
				class="rounded border p-2"
				type="number"
				placeholder="Sodium (mg)"
				bind:value={form.sodium}
			/>
			<input
				class="rounded border p-2"
				type="number"
				placeholder="Sugar (g)"
				bind:value={form.sugar}
			/>
			<input
				class="rounded border p-2"
				type="number"
				placeholder="Saturated Fat (g)"
				bind:value={form.saturatedFat}
			/>
			<input
				class="rounded border p-2"
				type="number"
				placeholder="Cholesterol (mg)"
				bind:value={form.cholesterol}
			/>
		</div>
	{/if}

	<label class="flex items-center gap-2">
		<input type="checkbox" bind:checked={form.isFavorite} />
		<span>Favorite</span>
	</label>
	<button class="rounded bg-black px-4 py-2 text-white" onclick={() => onSave(form)}>Save</button>
</div>
