<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import * as m from '$lib/paraglide/messages';
	import type { components } from '$lib/api/generated/schema';

	type DuplicateGroup = components['schemas']['FoodDuplicateGroup'];

	type Props = {
		groups: DuplicateGroup[];
		onResolve: (group: DuplicateGroup) => void;
	};

	let { groups, onResolve }: Props = $props();

	const previewGroups = $derived(groups.slice(0, 2));
</script>

{#if groups.length > 0}
	<Alert.Root
		variant="default"
		class="border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/30"
	>
		<AlertTriangle class="size-4 text-amber-600 dark:text-amber-400" />
		<Alert.Title class="flex items-center gap-2">
			{m.foods_duplicates_banner_title()}
			<Badge variant="secondary" class="text-[10px]">
				{m.foods_duplicates_banner_count({ count: groups.length })}
			</Badge>
		</Alert.Title>
		<Alert.Description class="mt-2 space-y-2">
			<ul class="space-y-1.5">
				{#each previewGroups as group (group.reason + ':' + group.key)}
					<li
						class="flex items-center justify-between gap-2 rounded-md border border-amber-200/60 bg-background/70 p-2 text-sm dark:border-amber-900/30"
					>
						<span class="min-w-0 flex-1 truncate">
							<span class="font-medium">
								{group.foods.map((f) => f.name).join(' · ')}
							</span>
							<span class="ml-2 text-xs text-muted-foreground">
								({group.reason === 'barcode'
									? m.foods_duplicates_reason_barcode()
									: m.foods_duplicates_reason_name_brand()})
							</span>
						</span>
						<Button size="sm" variant="outline" onclick={() => onResolve(group)}>
							{m.foods_duplicates_resolve()}
						</Button>
					</li>
				{/each}
			</ul>
			{#if groups.length > previewGroups.length}
				<div class="flex justify-end">
					<Button size="sm" variant="ghost" onclick={() => goto('/foods/duplicates')}>
						{m.foods_duplicates_view_all()}
						<ChevronRight class="size-4" />
					</Button>
				</div>
			{/if}
		</Alert.Description>
	</Alert.Root>
{/if}
