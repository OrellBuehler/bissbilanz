<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import * as m from '$lib/paraglide/messages';

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
	<Input placeholder={m.food_form_name()} bind:value={form.name} />
	<Input placeholder={m.food_form_brand()} bind:value={form.brand} />
	<Input placeholder={m.food_form_barcode()} bind:value={form.barcode} />
	<div class="grid grid-cols-2 gap-2">
		<Input type="number" placeholder={m.food_form_serving_size()} bind:value={form.servingSize} />
		<Input placeholder={m.food_form_unit()} bind:value={form.servingUnit} />
	</div>
	<div class="grid grid-cols-2 gap-2">
		<Input type="number" placeholder={m.food_form_calories()} bind:value={form.calories} />
		<Input type="number" placeholder={m.food_form_protein()} bind:value={form.protein} />
		<Input type="number" placeholder={m.food_form_carbs()} bind:value={form.carbs} />
		<Input type="number" placeholder={m.food_form_fat()} bind:value={form.fat} />
		<Input type="number" placeholder={m.food_form_fiber()} bind:value={form.fiber} />
	</div>

	<Collapsible.Root bind:open={showAdvanced}>
		<Collapsible.Trigger
			class="flex w-full items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
		>
			{#if showAdvanced}
				<ChevronDown class="size-4" />
			{:else}
				<ChevronRight class="size-4" />
			{/if}
			{m.food_form_advanced()}
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="grid grid-cols-2 gap-2 rounded-md border p-3">
				<Input type="number" placeholder={m.food_form_sodium()} bind:value={form.sodium} />
				<Input type="number" placeholder={m.food_form_sugar()} bind:value={form.sugar} />
				<Input type="number" placeholder={m.food_form_saturated_fat()} bind:value={form.saturatedFat} />
				<Input type="number" placeholder={m.food_form_cholesterol()} bind:value={form.cholesterol} />
			</div>
		</Collapsible.Content>
	</Collapsible.Root>

	<div class="flex items-center gap-2">
		<Checkbox id="favorite" bind:checked={form.isFavorite} />
		<Label for="favorite">{m.food_form_favorite()}</Label>
	</div>
	<Button onclick={() => onSave(form)}>{m.food_form_save()}</Button>
</div>
