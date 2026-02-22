<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages';
	import NutriScoreBadge from './NutriScoreBadge.svelte';
	import NovaGroupBadge from './NovaGroupBadge.svelte';
	import AdditivesList from './AdditivesList.svelte';

	type Props = {
		nutriScore?: 'a' | 'b' | 'c' | 'd' | 'e' | null;
		novaGroup?: 1 | 2 | 3 | 4 | null;
		additives?: string[] | null;
		ingredientsText?: string | null;
	};

	let {
		nutriScore = null,
		novaGroup = null,
		additives = null,
		ingredientsText = null
	}: Props = $props();

	const hasData = $derived(nutriScore || novaGroup || (additives && additives.length > 0));
</script>

{#if hasData}
	<Card.Root class="p-4">
		<h3 class="mb-3 text-sm font-semibold">{m.quality_title()}</h3>
		<div class="space-y-3">
			{#if nutriScore}
				<div class="flex items-center justify-between">
					<span class="text-sm text-muted-foreground">{m.quality_nutriscore()}</span>
					<NutriScoreBadge score={nutriScore} />
				</div>
			{/if}

			{#if novaGroup}
				<div class="flex items-center justify-between">
					<span class="text-sm text-muted-foreground">{m.quality_nova()}</span>
					<NovaGroupBadge group={novaGroup} />
				</div>
			{/if}

			{#if additives && additives.length > 0}
				<div>
					<span class="text-sm text-muted-foreground"
						>{m.quality_additives()} ({additives.length})</span
					>
					<div class="mt-1">
						<AdditivesList {additives} />
					</div>
				</div>
			{/if}

			{#if ingredientsText}
				<div>
					<span class="text-sm text-muted-foreground">{m.quality_ingredients()}</span>
					<p class="mt-1 text-xs text-muted-foreground/80">{ingredientsText}</p>
				</div>
			{/if}
		</div>
	</Card.Root>
{/if}
