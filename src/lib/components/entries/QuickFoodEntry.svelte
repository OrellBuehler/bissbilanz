<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import NumberInput from '$lib/components/shared/NumberInput.svelte';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import * as m from '$lib/paraglide/messages';
	import NutrientCategoryInputs from '$lib/components/foods/NutrientCategoryInputs.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import { DEFAULT_VISIBLE_NUTRIENTS } from '$lib/nutrients';

	export type QuickLogPayload = {
		quickName?: string;
		quickCalories: number;
		quickProtein?: number;
		quickCarbs?: number;
		quickFat?: number;
		quickFiber?: number;
		quickNutrients?: Record<string, number>;
	};

	type Props = {
		eatenTime: string;
		onEatenTimeChange: (value: string) => void;
		onSubmit: (payload: QuickLogPayload) => void;
	};

	let { eatenTime, onEatenTimeChange, onSubmit }: Props = $props();

	let quickName = $state('');
	let quickCalories = $state<number | null>(null);
	let quickProtein = $state<number | null>(null);
	let quickCarbs = $state<number | null>(null);
	let quickFat = $state<number | null>(null);
	let quickFiber = $state<number | null>(null);
	let quickMacrosOpen = $state(false);
	let quickNutrients = $state<Record<string, number>>({});
	let quickNutrientsOpen = $state(false);

	const cachedPrefs = useLiveQuery(() => preferencesService.preferences(), undefined);
	let visibleNutrients = $derived(cachedPrefs.value?.visibleNutrients ?? DEFAULT_VISIBLE_NUTRIENTS);

	const setQuickNutrient = (key: string, value: number | null) => {
		if (value == null) {
			delete quickNutrients[key];
		} else {
			quickNutrients[key] = value;
		}
	};

	let macroCalories = $derived(
		(quickProtein ?? 0) * 4 + (quickCarbs ?? 0) * 4 + (quickFat ?? 0) * 9
	);
	let hasMacros = $derived(
		(quickProtein != null || quickCarbs != null || quickFat != null) && quickCalories != null
	);
	let macrosMatch = $derived(Math.round(macroCalories) === Math.round(quickCalories ?? 0));

	const submit = () => {
		const cal = quickCalories;
		if (!cal || cal < 0) return;
		onSubmit({
			quickName: quickName.trim() || undefined,
			quickCalories: cal,
			quickProtein: quickProtein ?? undefined,
			quickCarbs: quickCarbs ?? undefined,
			quickFat: quickFat ?? undefined,
			quickFiber: quickFiber ?? undefined,
			quickNutrients: Object.keys(quickNutrients).length ? { ...quickNutrients } : undefined
		});
		quickName = '';
		quickCalories = null;
		quickProtein = null;
		quickCarbs = null;
		quickFat = null;
		quickFiber = null;
		quickNutrients = {};
	};
</script>

<div class="grid gap-3">
	<Input placeholder={m.quick_log_name_placeholder()} bind:value={quickName} />
	<div class="grid gap-1.5">
		<Label>{m.quick_log_calories()}</Label>
		<NumberInput bind:value={quickCalories} />
	</div>
	<button
		type="button"
		class="flex items-center gap-1 text-sm text-muted-foreground"
		onclick={() => (quickMacrosOpen = !quickMacrosOpen)}
	>
		{#if quickMacrosOpen}
			<ChevronUp class="size-4" />
		{:else}
			<ChevronDown class="size-4" />
		{/if}
		{m.quick_log_macros()}
	</button>
	{#if quickMacrosOpen}
		<div class="grid grid-cols-2 gap-3">
			<div class="grid gap-1.5">
				<Label class="text-xs">{m.quick_log_protein()}</Label>
				<NumberInput bind:value={quickProtein} />
			</div>
			<div class="grid gap-1.5">
				<Label class="text-xs">{m.quick_log_carbs()}</Label>
				<NumberInput bind:value={quickCarbs} />
			</div>
			<div class="grid gap-1.5">
				<Label class="text-xs">{m.quick_log_fat()}</Label>
				<NumberInput bind:value={quickFat} />
			</div>
			<div class="grid gap-1.5">
				<Label class="text-xs">{m.quick_log_fiber()}</Label>
				<NumberInput bind:value={quickFiber} />
			</div>
		</div>
		{#if hasMacros}
			<div
				class="flex items-center gap-1.5 text-xs {macrosMatch
					? 'text-green-600 dark:text-green-400'
					: 'text-amber-600 dark:text-amber-400'}"
			>
				{#if macrosMatch}
					<CircleCheck class="size-3.5" />
				{:else}
					<TriangleAlert class="size-3.5" />
				{/if}
				{m.quick_log_macro_calories({ calories: Math.round(macroCalories) })}
			</div>
		{/if}
	{/if}
	<button
		type="button"
		class="flex items-center gap-1 text-sm text-muted-foreground"
		onclick={() => (quickNutrientsOpen = !quickNutrientsOpen)}
	>
		{#if quickNutrientsOpen}
			<ChevronUp class="size-4" />
		{:else}
			<ChevronDown class="size-4" />
		{/if}
		{m.quick_log_nutrients()}
	</button>
	{#if quickNutrientsOpen}
		<div class="space-y-2">
			<NutrientCategoryInputs
				values={quickNutrients}
				onChange={setQuickNutrient}
				{visibleNutrients}
				idPrefix="quick-"
			/>
		</div>
	{/if}
	<div class="grid gap-1.5">
		<Label class="text-xs">{m.add_food_time()}</Label>
		<Input
			type="time"
			value={eatenTime}
			oninput={(e) => onEatenTimeChange((e.target as HTMLInputElement).value)}
		/>
	</div>
	<Button class="w-full" disabled={quickCalories == null || quickCalories <= 0} onclick={submit}>
		<Check class="mr-1 size-4" />
		{m.quick_log_add()}
	</Button>
</div>
