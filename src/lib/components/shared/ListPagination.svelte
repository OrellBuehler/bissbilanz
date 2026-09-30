<script lang="ts">
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import * as m from '$lib/paraglide/messages';

	let {
		count,
		perPage,
		page = $bindable(1),
		class: className = 'mt-4'
	}: { count: number; perPage: number; page?: number; class?: string } = $props();

	const totalPages = $derived(Math.max(1, Math.ceil(count / perPage)));

	$effect(() => {
		if (page > totalPages) page = totalPages;
	});
</script>

{#if count > perPage}
	<Pagination.Root {count} {perPage} bind:page class={className}>
		{#snippet children({ pages, currentPage })}
			<Pagination.Content>
				<Pagination.Item>
					<Pagination.PrevButton>
						<ChevronLeft class="size-4" />
						<span class="hidden sm:block">{m.pagination_previous()}</span>
					</Pagination.PrevButton>
				</Pagination.Item>
				{#each pages as p (p.key)}
					{#if p.type === 'ellipsis'}
						<Pagination.Item>
							<Pagination.Ellipsis />
						</Pagination.Item>
					{:else}
						<Pagination.Item>
							<Pagination.Link page={p} isActive={currentPage === p.value}>
								{p.value}
							</Pagination.Link>
						</Pagination.Item>
					{/if}
				{/each}
				<Pagination.Item>
					<Pagination.NextButton>
						<span class="hidden sm:block">{m.pagination_next()}</span>
						<ChevronRight class="size-4" />
					</Pagination.NextButton>
				</Pagination.Item>
			</Pagination.Content>
		{/snippet}
	</Pagination.Root>
{/if}
