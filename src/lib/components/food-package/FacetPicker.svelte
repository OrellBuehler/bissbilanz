<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import Check from '@lucide/svelte/icons/check';
	import * as m from '$lib/paraglide/messages';

	type Item = { value: string; count: number };
	type Props = {
		label: string;
		items: Item[];
		selected: string[];
	};

	let { label, items, selected = $bindable([]) }: Props = $props();

	const MAX_VISIBLE = 40;
	let search = $state('');

	const visible = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const picked = items.filter((item) => selected.includes(item.value));
		const rest = items.filter(
			(item) => !selected.includes(item.value) && (!q || item.value.toLowerCase().includes(q))
		);
		return [...picked, ...rest.slice(0, MAX_VISIBLE)];
	});

	const toggle = (value: string) => {
		selected = selected.includes(value)
			? selected.filter((item) => item !== value)
			: [...selected, value];
	};
</script>

<div class="space-y-2">
	<div class="flex items-center justify-between gap-2">
		<p class="text-sm font-medium">{label}</p>
		{#if items.length > 8}
			<Input
				class="h-8 max-w-40"
				placeholder={m.food_package_filter_search()}
				aria-label={label}
				bind:value={search}
			/>
		{/if}
	</div>
	{#if items.length === 0}
		<p class="text-xs text-muted-foreground">{m.food_package_filter_empty()}</p>
	{:else}
		<div class="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
			{#each visible as item (item.value)}
				{@const active = selected.includes(item.value)}
				<Button
					variant={active ? 'default' : 'outline'}
					size="sm"
					class="h-8 rounded-full px-3"
					aria-pressed={active}
					onclick={() => toggle(item.value)}
				>
					{#if active}<Check class="size-3.5" />{/if}
					<span class="max-w-40 truncate">{item.value}</span>
					<span class="tabular-nums opacity-60">{item.count}</span>
				</Button>
			{/each}
		</div>
	{/if}
</div>
