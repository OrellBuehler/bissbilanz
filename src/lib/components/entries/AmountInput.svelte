<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import NumberInput from '$lib/components/shared/NumberInput.svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import { round2 } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		servings: number;
		servingSize?: number | null;
		servingUnit?: string | null;
		caloriesPerServing?: number | null;
		onServingsChange: (servings: number) => void;
	};

	let { servings, servingSize, servingUnit, caloriesPerServing, onServingsChange }: Props =
		$props();

	let mode: 'servings' | 'unit' = $state('servings');
	let unitAmount = $state<number | null>(0);

	// Local mirror of the `servings` prop for the NumberInput binding: keeps
	// whatever the user is currently typing (including transient invalid
	// values) without forcing it back to the last valid value, and only
	// propagates upward via onServingsChange once the entry is valid (>0) —
	// matching the previous manual-oninput validation behavior.
	// svelte-ignore state_referenced_locally
	let servingsValue = $state<number | null>(servings);

	$effect(() => {
		servingsValue = servings;
	});

	const hasServingInfo = $derived(!!servingSize && !!servingUnit);

	$effect(() => {
		if (mode === 'servings' && hasServingInfo && servingSize) {
			unitAmount = Math.round(servings * servingSize * 10) / 10;
		}
	});

	const previewAmount = $derived.by(() => {
		if (!hasServingInfo || !servingSize || !servingUnit) return null;
		const amount = Math.round(servings * servingSize * 10) / 10;
		return m.amount_preview_equals({ amount: String(amount), unit: servingUnit });
	});

	const previewKcal = $derived.by(() => {
		if (caloriesPerServing == null) return null;
		const kcal = Math.round(servings * caloriesPerServing);
		return m.amount_preview_kcal({ kcal: String(kcal) });
	});

	const handleServingsChange = (val: number | null) => {
		servingsValue = val;
		if (val != null && val > 0) {
			onServingsChange(val);
		}
	};

	const handleUnitChange = (val: number | null) => {
		unitAmount = val;
		if (val != null && val > 0 && servingSize) {
			onServingsChange(Math.round((val / servingSize) * 1000) / 1000);
		}
	};

	const handleModeChange = (value: string | undefined) => {
		if (value === 'servings' || value === 'unit') {
			mode = value;
		}
	};
</script>

<div class="grid gap-2">
	{#if hasServingInfo}
		<div class="flex items-center gap-2">
			<Label class="shrink-0"
				>{mode === 'servings' ? m.amount_mode_servings() : m.amount_mode_unit()}</Label
			>
			<ToggleGroup.Root type="single" value={mode} onValueChange={handleModeChange} class="ml-auto">
				<ToggleGroup.Item value="servings" class="h-7 px-2 text-xs"
					>{m.amount_mode_servings()}</ToggleGroup.Item
				>
				<ToggleGroup.Item value="unit" class="h-7 px-2 text-xs"
					>{m.amount_mode_unit()}</ToggleGroup.Item
				>
			</ToggleGroup.Root>
		</div>
	{:else}
		<Label>{m.amount_mode_servings()}</Label>
	{/if}

	{#if mode === 'servings'}
		<div class="flex items-center gap-2">
			<NumberInput bind:value={() => servingsValue, handleServingsChange} class="min-w-0 flex-1" />
			{#if previewAmount || previewKcal}
				<span class="shrink-0 text-xs text-muted-foreground">
					{#if previewAmount}{previewAmount}{/if}
					{#if previewAmount && previewKcal}{' '}{/if}
					{#if previewKcal}({previewKcal}){/if}
				</span>
			{/if}
		</div>
	{:else}
		<div class="flex items-center gap-2">
			<NumberInput bind:value={() => unitAmount, handleUnitChange} class="min-w-0 flex-1" />
			<span class="shrink-0 text-sm text-muted-foreground">{servingUnit}</span>
		</div>
		{#if previewKcal}
			<span class="text-xs text-muted-foreground">
				{m.amount_preview_equals({
					amount: String(round2(servings)),
					unit: ` ${m.amount_mode_servings().toLowerCase()}`
				})}
				({previewKcal})
			</span>
		{/if}
	{/if}
</div>
