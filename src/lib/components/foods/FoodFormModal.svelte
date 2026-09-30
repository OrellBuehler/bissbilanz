<script lang="ts">
	import FoodForm from '$lib/components/foods/FoodForm.svelte';
	import FoodQualityPanel from '$lib/components/quality/FoodQualityPanel.svelte';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import * as m from '$lib/paraglide/messages';
	import type { ComponentProps } from 'svelte';
	import type { components } from '$lib/api/generated/schema';

	type Food = components['schemas']['Food'];
	type OffProduct = components['schemas']['OpenFoodFactsProduct'];

	type Props = {
		open: boolean;
		editingFood: Food | null;
		offData: OffProduct | null;
		offLoading: boolean;
		offNotFound: boolean;
		activeBarcode: string;
		qualityOpen: boolean;
		initial: ComponentProps<typeof FoodForm>['initial'];
		imageUrl: string | null;
		uploading: boolean;
		visibleNutrients: string[];
		onSave: ComponentProps<typeof FoodForm>['onSave'];
		onBarcodeScan?: (barcode: string) => void;
		onImageUpload: (file: File) => Promise<void>;
		onImageRemove: () => Promise<void>;
	};

	let {
		open = $bindable(),
		editingFood,
		offData,
		offLoading,
		offNotFound,
		activeBarcode,
		qualityOpen = $bindable(),
		initial,
		imageUrl,
		uploading,
		visibleNutrients,
		onSave,
		onBarcodeScan,
		onImageUpload,
		onImageRemove
	}: Props = $props();
</script>

<ResponsiveModal
	bind:open
	title={editingFood ? m.food_form_name() : m.foods_new()}
	description={editingFood ? editingFood.name : m.foods_new_description()}
>
	{#if offLoading}
		<p class="text-sm text-muted-foreground">{m.quality_off_loading()}</p>
	{:else}
		{#if offNotFound && activeBarcode}
			<p class="mb-3 text-sm text-amber-600">{m.quality_off_not_found()}</p>
		{:else if offData && !editingFood}
			<p class="mb-3 text-sm text-green-600">{m.quality_off_prefilled()}</p>
			<Collapsible.Root bind:open={qualityOpen}>
				<Collapsible.Trigger
					class="flex w-full items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
				>
					<ChevronDown class="size-4 transition-transform [[data-state=closed]_&]:-rotate-90" />
					{m.quality_title()}
				</Collapsible.Trigger>
				<Collapsible.Content>
					<FoodQualityPanel
						nutriScore={offData.nutriScore as 'a' | 'b' | 'c' | 'd' | 'e' | null}
						novaGroup={offData.novaGroup as 1 | 2 | 3 | 4 | null}
						additives={offData.additives}
						ingredientsText={offData.ingredientsText}
					/>
				</Collapsible.Content>
			</Collapsible.Root>
		{:else if editingFood && (editingFood.novaGroup || (editingFood.additives?.length ?? 0) > 0 || editingFood.ingredientsText)}
			<div class="mb-3">
				<Collapsible.Root bind:open={qualityOpen}>
					<Collapsible.Trigger
						class="flex w-full items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
					>
						<ChevronDown class="size-4 transition-transform [[data-state=closed]_&]:-rotate-90" />
						{m.quality_title()}
					</Collapsible.Trigger>
					<Collapsible.Content>
						<FoodQualityPanel
							novaGroup={editingFood.novaGroup as 1 | 2 | 3 | 4 | null}
							additives={editingFood.additives}
							ingredientsText={editingFood.ingredientsText}
						/>
					</Collapsible.Content>
				</Collapsible.Root>
			</div>
		{/if}
		{#key editingFood?.id ?? offData ?? activeBarcode}
			<FoodForm
				{initial}
				{onSave}
				{onBarcodeScan}
				{imageUrl}
				{onImageUpload}
				{onImageRemove}
				{uploading}
				{visibleNutrients}
			/>
		{/key}
	{/if}
</ResponsiveModal>
