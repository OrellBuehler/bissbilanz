<script lang="ts">
	import { getAdditiveInfo, getRiskColor } from '$lib/utils/additives';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		additives: string[];
		compact?: boolean;
	};

	let { additives, compact = false }: Props = $props();

	const sorted = $derived(
		additives
			.map((tag) => ({ tag, ...getAdditiveInfo(tag) }))
			.sort((a, b) => {
				const order = { high: 0, moderate: 1, low: 2 };
				return order[a.risk] - order[b.risk];
			})
	);

	const displayed = $derived(compact ? sorted.slice(0, 5) : sorted);
	const remaining = $derived(sorted.length - displayed.length);
</script>

{#if sorted.length > 0}
	<div class="flex flex-wrap gap-1">
		{#each displayed as additive}
			<span class="rounded border px-1.5 py-0.5 text-xs {getRiskColor(additive.risk)}">
				{additive.name}
			</span>
		{/each}
		{#if remaining > 0}
			<span class="px-1.5 py-0.5 text-xs text-muted-foreground">
				+{remaining}
			</span>
		{/if}
	</div>
{/if}
