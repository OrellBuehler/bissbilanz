<script lang="ts">
	import { MACRO_TEXT_CLASS, type MacroKey } from '$lib/utils/colors';
	import { formatKcal, formatGrams } from '$lib/utils/number';
	import { cn } from '$lib/utils.js';

	type Props = {
		macro: MacroKey;
		value: number;
		/** Overrides the auto unit ('' for calories, 'g' otherwise). */
		unit?: string;
		/** Short label appended after the value+unit, e.g. "P" for protein. */
		suffix?: string;
		class?: string;
	};

	let {
		macro,
		value,
		unit = macro === 'calories' ? '' : 'g',
		suffix = '',
		class: className
	}: Props = $props();

	const formatted = $derived(macro === 'calories' ? formatKcal(value) : formatGrams(value));
	const unitText = $derived(unit === '' ? '' : unit === 'g' ? 'g' : ` ${unit}`);
</script>

<span class={cn('tabular-nums', MACRO_TEXT_CLASS[macro], className)}
	>{formatted}{unitText}{suffix ? ` ${suffix}` : ''}</span
>
