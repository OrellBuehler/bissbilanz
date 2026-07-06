<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import { parseDecimalInput } from '$lib/utils/number';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = Omit<HTMLInputAttributes, 'type' | 'value' | 'files'> & {
		value: number | null;
	};

	let { value = $bindable(null), ...restProps }: Props = $props();

	const format = (v: number | null): string => (v == null ? '' : String(v));

	// Captures the initial value once — the string mirror is otherwise kept in
	// sync by the effect below, not by re-reading `value` on every render.
	// svelte-ignore state_referenced_locally
	let text = $state(format(value));

	$effect(() => {
		// Re-sync the display string when `value` changes from outside in a way
		// the current text doesn't already represent (e.g. a form reset). Avoid
		// clobbering the text while the user is mid-typing an intermediate/
		// invalid value (e.g. "12," or "abc") that still resolves to the same
		// `value` it just produced.
		const parsed = parseDecimalInput(text);
		const current = Number.isNaN(parsed) ? null : parsed;
		if (value !== current) {
			text = format(value);
		}
	});

	function handleInput(e: Event) {
		text = (e.currentTarget as HTMLInputElement).value;
		const parsed = parseDecimalInput(text);
		value = Number.isNaN(parsed) ? null : parsed;
	}
</script>

<Input type="text" inputmode="decimal" value={text} oninput={handleInput} {...restProps} />
