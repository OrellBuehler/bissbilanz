<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
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
	let unitAmount = $state(0);

	const hasServingInfo = $derived(!!servingSize && !!servingUnit);

	$effect(() => {
		if (hasServingInfo && servingSize) {
			unitAmount = Math.round(servings * servingSize * 10) / 10;
		}
	});

	const previewAmount = $derived.by(() => {
		if (!hasServingInfo || !servingSize || !servingUnit) return null;
		const amount = Math.round(servings * servingSize * 10) / 10;
		return m.amount_preview_equals({ amount: String(amount), unit: servingUnit });
	});

	const previewKcal = $derived.by(() => {
		if (!caloriesPerServing) return null;
		const kcal = Math.round(servings * caloriesPerServing);
		return m.amount_preview_kcal({ kcal: String(kcal) });
	});

	const handleServingsInput = (e: Event) => {
		const val = parseFloat((e.target as HTMLInputElement).value);
		if (!isNaN(val) && val > 0) {
			onServingsChange(val);
		}
	};

	const handleUnitInput = (e: Event) => {
		const val = parseFloat((e.target as HTMLInputElement).value);
		if (!isNaN(val) && val > 0 && servingSize) {
			unitAmount = val;
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
			<Label class="shrink-0">{mode === 'servings' ? m.amount_mode_servings() : m.amount_mode_unit()}</Label>
			<ToggleGroup.Root type="single" value={mode} onValueChange={handleModeChange} class="ml-auto">
				<ToggleGroup.Item value="servings" class="h-7 px-2 text-xs">{m.amount_mode_servings()}</ToggleGroup.Item>
				<ToggleGroup.Item value="unit" class="h-7 px-2 text-xs">{m.amount_mode_unit()}</ToggleGroup.Item>
			</ToggleGroup.Root>
		</div>
	{:else}
		<Label>{m.amount_mode_servings()}</Label>
	{/if}

	{#if mode === 'servings'}
		<div class="flex items-center gap-2">
			<Input type="number" value={servings} oninput={handleServingsInput} min="0.1" step="0.1" class="flex-1" />
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
			<Input type="number" value={unitAmount} oninput={handleUnitInput} min="0.1" step="0.1" class="flex-1" />
			<span class="shrink-0 text-sm text-muted-foreground">{servingUnit}</span>
		</div>
		{#if previewKcal}
			<span class="text-xs text-muted-foreground">
				{m.amount_preview_equals({ amount: String(Math.round(servings * 100) / 100), unit: ` ${m.amount_mode_servings().toLowerCase()}` })}
				({previewKcal})
			</span>
		{/if}
	{/if}
</div>
