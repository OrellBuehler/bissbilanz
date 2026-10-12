<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import { budgetToInput, formatUsd, parseBudgetInput } from './format';

	type Props = {
		value: number | null;
		defaultBudget: number | null;
		disabled?: boolean;
		class?: string;
		onSave: (value: number | null) => void | Promise<void>;
	};

	let { value, defaultBudget, disabled = false, class: className, onSave }: Props = $props();

	let text = $derived(budgetToInput(value));

	function commit() {
		const parsed = parseBudgetInput(text);
		if (!parsed.ok) {
			text = budgetToInput(value);
			toast.error(m.admin_save_failed());
			return;
		}
		if (parsed.value === value) {
			text = budgetToInput(value);
			return;
		}
		void onSave(parsed.value);
	}
</script>

<Input
	bind:value={text}
	type="text"
	inputmode="decimal"
	autocomplete="off"
	aria-label={m.admin_users_col_budget()}
	placeholder={defaultBudget === null
		? undefined
		: m.admin_users_budget_default({ amount: formatUsd(defaultBudget) })}
	{disabled}
	class={className}
	onblur={commit}
	onkeydown={(event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			event.currentTarget.blur();
		}
	}}
/>
