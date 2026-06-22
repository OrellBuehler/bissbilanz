<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import { parseDecimalInput } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';

	export type QuickLogPayload = {
		quickName?: string;
		quickCalories: number;
		quickProtein?: number;
		quickCarbs?: number;
		quickFat?: number;
		quickFiber?: number;
	};

	type Props = {
		eatenTime: string;
		onEatenTimeChange: (value: string) => void;
		onSubmit: (payload: QuickLogPayload) => void;
	};

	let { eatenTime, onEatenTimeChange, onSubmit }: Props = $props();

	let quickName = $state('');
	let quickCalories = $state('');
	let quickProtein = $state('');
	let quickCarbs = $state('');
	let quickFat = $state('');
	let quickFiber = $state('');
	let quickMacrosOpen = $state(false);

	let macroCalories = $derived(
		(parseDecimalInput(quickProtein) || 0) * 4 +
			(parseDecimalInput(quickCarbs) || 0) * 4 +
			(parseDecimalInput(quickFat) || 0) * 9
	);
	let hasMacros = $derived((!!quickProtein || !!quickCarbs || !!quickFat) && !!quickCalories);
	let macrosMatch = $derived(
		Math.round(macroCalories) === Math.round(parseDecimalInput(quickCalories) || 0)
	);

	const submit = () => {
		const cal = parseDecimalInput(quickCalories);
		if (!cal || cal < 0) return;
		onSubmit({
			quickName: quickName.trim() || undefined,
			quickCalories: cal,
			quickProtein: quickProtein ? parseDecimalInput(quickProtein) : undefined,
			quickCarbs: quickCarbs ? parseDecimalInput(quickCarbs) : undefined,
			quickFat: quickFat ? parseDecimalInput(quickFat) : undefined,
			quickFiber: quickFiber ? parseDecimalInput(quickFiber) : undefined
		});
		quickName = '';
		quickCalories = '';
		quickProtein = '';
		quickCarbs = '';
		quickFat = '';
		quickFiber = '';
	};
</script>

<div class="grid gap-3">
	<Input placeholder={m.quick_log_name_placeholder()} bind:value={quickName} />
	<div class="grid gap-1.5">
		<Label>{m.quick_log_calories()}</Label>
		<Input type="number" inputmode="decimal" min="0" bind:value={quickCalories} />
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
				<Input type="number" inputmode="decimal" min="0" bind:value={quickProtein} />
			</div>
			<div class="grid gap-1.5">
				<Label class="text-xs">{m.quick_log_carbs()}</Label>
				<Input type="number" inputmode="decimal" min="0" bind:value={quickCarbs} />
			</div>
			<div class="grid gap-1.5">
				<Label class="text-xs">{m.quick_log_fat()}</Label>
				<Input type="number" inputmode="decimal" min="0" bind:value={quickFat} />
			</div>
			<div class="grid gap-1.5">
				<Label class="text-xs">{m.quick_log_fiber()}</Label>
				<Input type="number" inputmode="decimal" min="0" bind:value={quickFiber} />
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
	<div class="grid gap-1.5">
		<Label class="text-xs">{m.add_food_time()}</Label>
		<Input
			type="time"
			value={eatenTime}
			oninput={(e) => onEatenTimeChange((e.target as HTMLInputElement).value)}
		/>
	</div>
	<Button
		class="w-full"
		disabled={!quickCalories || parseDecimalInput(quickCalories) <= 0}
		onclick={submit}
	>
		<Check class="mr-1 size-4" />
		{m.quick_log_add()}
	</Button>
</div>
