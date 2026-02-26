<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import BarcodeScanModal from '$lib/components/barcode/BarcodeScanModal.svelte';
	import NutriScoreSelector from '$lib/components/quality/NutriScoreSelector.svelte';
	import ScanBarcode from '@lucide/svelte/icons/scan-barcode';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Check from '@lucide/svelte/icons/check';
	import * as m from '$lib/paraglide/messages';
	import { servingUnitValues, type ServingUnit } from '$lib/units';
	import { round2 } from '$lib/utils/number';

	const unitLabels: Record<ServingUnit, () => string> = {
		g: () => m.food_form_unit_g(),
		kg: () => m.food_form_unit_kg(),
		ml: () => m.food_form_unit_ml(),
		l: () => m.food_form_unit_l(),
		oz: () => m.food_form_unit_oz(),
		lb: () => m.food_form_unit_lb(),
		fl_oz: () => m.food_form_unit_fl_oz(),
		cup: () => m.food_form_unit_cup(),
		tbsp: () => m.food_form_unit_tbsp(),
		tsp: () => m.food_form_unit_tsp()
	};

	const unitOptions = servingUnitValues.map((value) => ({
		value,
		label: unitLabels[value]
	}));

	type FoodFormData = {
		name: string;
		brand: string;
		servingSize: number;
		servingUnit: ServingUnit;
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
		nutriScore?: 'a' | 'b' | 'c' | 'd' | 'e' | null;
		novaGroup?: number | null;
		additives?: string[] | null;
		ingredientsText?: string | null;
		imageUrl?: string | null;
	};

	type Props = {
		initial?: Partial<FoodFormData>;
		onSave: (payload: FoodFormData) => Promise<void>;
		onBarcodeScan?: (barcode: string) => void;
		imageUrl?: string | null;
		onImageUpload?: (file: File) => Promise<void>;
	};

	let { initial = {}, onSave, onBarcodeScan, imageUrl, onImageUpload }: Props = $props();

	let showAdvanced = $state(false);
	let saving = $state(false);
	let scanOpen = $state(false);

	function handleScanned(barcode: string) {
		form.barcode = barcode;
		onBarcodeScan?.(barcode);
	}

	// Build initial form values (intentionally captures initial prop once — form state is independent)
	// svelte-ignore state_referenced_locally
	let form = $state<FoodFormData>({
		name: initial.name ?? '',
		brand: initial.brand ?? '',
		servingSize: initial.servingSize ? round2(initial.servingSize) : 0,
		servingUnit: initial.servingUnit ?? 'g',
		calories: initial.calories ? round2(initial.calories) : 0,
		protein: initial.protein ? round2(initial.protein) : 0,
		carbs: initial.carbs ? round2(initial.carbs) : 0,
		fat: initial.fat ? round2(initial.fat) : 0,
		fiber: initial.fiber ? round2(initial.fiber) : 0,
		sodium: initial.sodium ? round2(initial.sodium) : null,
		sugar: initial.sugar ? round2(initial.sugar) : null,
		saturatedFat: initial.saturatedFat ? round2(initial.saturatedFat) : null,
		cholesterol: initial.cholesterol ? round2(initial.cholesterol) : null,
		barcode: initial.barcode ?? '',
		isFavorite: initial.isFavorite ?? false,
		nutriScore: initial.nutriScore ?? null,
		novaGroup: initial.novaGroup ?? null,
		additives: initial.additives ?? null,
		ingredientsText: initial.ingredientsText ?? null,
		imageUrl: initial.imageUrl ?? null
	});

	let isValid = $derived(form.name.trim().length > 0 && form.servingSize > 0);

	let expectedCalories = $derived(
		Math.round(form.protein * 4 + form.carbs * 4 + form.fat * 9 + form.fiber * 2)
	);

	let calorieMismatch = $derived(() => {
		if (form.calories === 0 && expectedCalories === 0) return false;
		if (form.calories === 0 || expectedCalories === 0) return true;
		const diff = Math.abs(form.calories - expectedCalories);
		return diff / expectedCalories > 0.1; // >10% difference
	});

	async function handleSave() {
		saving = true;
		try {
			await onSave(form);
		} finally {
			saving = false;
		}
	}
</script>

{#if onImageUpload}
	<div class="mb-4 space-y-2">
		<div class="aspect-video w-full overflow-hidden rounded-xl border">
			{#if imageUrl}
				<img src={imageUrl} alt={form.name} class="h-full w-full object-cover" />
			{:else}
				<div class="flex h-full w-full items-center justify-center bg-muted">
					<span class="text-4xl font-bold text-muted-foreground"
						>{form.name.charAt(0).toUpperCase()}</span
					>
				</div>
			{/if}
		</div>
		<Label for="food-image-upload">{m.image_upload_label()}</Label>
		<input
			id="food-image-upload"
			type="file"
			accept="image/*"
			onchange={async (e) => {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (file) await onImageUpload(file);
			}}
			class="mt-1 block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
		/>
	</div>
{/if}

<div class="grid gap-3">
	<div class="grid gap-1.5">
		<Label for="name">{m.food_form_name()}</Label>
		<Input id="name" bind:value={form.name} />
	</div>
	<div class="grid gap-1.5">
		<Label for="brand">{m.food_form_brand()}</Label>
		<Input id="brand" bind:value={form.brand} />
	</div>
	<div class="grid gap-1.5">
		<Label for="barcode">{m.food_form_barcode()}</Label>
		<div class="flex min-w-0 gap-2">
			<Input id="barcode" bind:value={form.barcode} class="min-w-0 flex-1" />
			<Button type="button" variant="outline" size="icon" onclick={() => (scanOpen = true)}>
				<ScanBarcode class="size-4" />
			</Button>
		</div>
	</div>
	<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
		<div class="grid gap-1.5">
			<Label for="servingSize">{m.food_form_serving_size()}</Label>
			<Input id="servingSize" type="number" bind:value={form.servingSize} />
		</div>
		<div class="grid gap-1.5">
			<Label>{m.food_form_unit()}</Label>
			<Select.Root type="single" bind:value={form.servingUnit}>
				<Select.Trigger>
					{unitOptions.find((o) => o.value === form.servingUnit)?.label() ?? form.servingUnit}
				</Select.Trigger>
				<Select.Content>
					{#each unitOptions as unit}
						<Select.Item value={unit.value}>{unit.label()}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>
	<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
		<div class="grid gap-1.5">
			<Label for="calories">{m.food_form_calories()}</Label>
			<Input id="calories" type="number" bind:value={form.calories} />
		</div>
		<div class="grid gap-1.5">
			<Label for="protein">{m.food_form_protein()}</Label>
			<Input id="protein" type="number" bind:value={form.protein} />
		</div>
		<div class="grid gap-1.5">
			<Label for="carbs">{m.food_form_carbs()}</Label>
			<Input id="carbs" type="number" bind:value={form.carbs} />
		</div>
		<div class="grid gap-1.5">
			<Label for="fat">{m.food_form_fat()}</Label>
			<Input id="fat" type="number" bind:value={form.fat} />
		</div>
		<div class="grid gap-1.5">
			<Label for="fiber">{m.food_form_fiber()}</Label>
			<Input id="fiber" type="number" bind:value={form.fiber} />
		</div>
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
			<div class="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2">
				<div class="grid gap-1.5">
					<Label for="sodium">{m.food_form_sodium()}</Label>
					<Input id="sodium" type="number" bind:value={form.sodium} />
				</div>
				<div class="grid gap-1.5">
					<Label for="sugar">{m.food_form_sugar()}</Label>
					<Input id="sugar" type="number" bind:value={form.sugar} />
				</div>
				<div class="grid gap-1.5">
					<Label for="saturatedFat">{m.food_form_saturated_fat()}</Label>
					<Input id="saturatedFat" type="number" bind:value={form.saturatedFat} />
				</div>
				<div class="grid gap-1.5">
					<Label for="cholesterol">{m.food_form_cholesterol()}</Label>
					<Input id="cholesterol" type="number" bind:value={form.cholesterol} />
				</div>
				<div class="col-span-full grid gap-1.5">
					<Label>{m.quality_nutriscore()}</Label>
					<NutriScoreSelector
						value={form.nutriScore ?? null}
						onchange={(v) => (form.nutriScore = v)}
					/>
				</div>
			</div>
		</Collapsible.Content>
	</Collapsible.Root>

	{#if calorieMismatch()}
		<p
			class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300"
		>
			{m.food_form_calorie_hint({
				expected: String(expectedCalories),
				actual: String(form.calories)
			})}
		</p>
	{/if}

	<div class="flex items-center gap-2">
		<Checkbox id="favorite" bind:checked={form.isFavorite} />
		<Label for="favorite">{m.food_form_favorite()}</Label>
	</div>
	<Button class="w-full sm:w-auto" disabled={!isValid || saving} onclick={handleSave}>
		<Check class="size-4" />
		{m.food_form_save()}
	</Button>
</div>

<BarcodeScanModal
	bind:open={scanOpen}
	onClose={() => (scanOpen = false)}
	onBarcode={handleScanned}
/>
