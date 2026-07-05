<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { MACRO_BADGE_CLASS, type MacroKey } from '$lib/utils/colors';
	import { formatKcal, formatGrams } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';
	import { cn } from '$lib/utils.js';

	const DEFAULT_LABEL: Record<MacroKey, string> = {
		calories: '',
		protein: 'P',
		carbs: 'C',
		fat: 'F',
		fiber: 'Fi'
	};

	type Props = {
		macro: MacroKey;
		value: number;
		/** Short label after the value, e.g. "P" for protein. Defaults per macro. */
		label?: string;
		class?: string;
	};

	let { macro, value, label, class: className }: Props = $props();

	const resolvedLabel = $derived(label ?? DEFAULT_LABEL[macro]);
	const text = $derived(
		macro === 'calories'
			? `${formatKcal(value)} ${m.foods_kcal()}`
			: `${formatGrams(value)}g${resolvedLabel ? ` ${resolvedLabel}` : ''}`
	);
</script>

<Badge
	variant="secondary"
	class={cn('px-1.5 py-0 text-[10px]', MACRO_BADGE_CLASS[macro], className)}
>
	{text}
</Badge>
