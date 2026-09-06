<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import Heart from '@lucide/svelte/icons/heart';
	import HeartOff from '@lucide/svelte/icons/heart-off';
	import Tag from '@lucide/svelte/icons/tag';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import CheckCheck from '@lucide/svelte/icons/check-check';
	import X from '@lucide/svelte/icons/x';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		count: number;
		allSelected: boolean;
		busy?: boolean;
		onSelectAll: () => void;
		onClear: () => void;
		onFavorite: (favorite: boolean) => void;
		onLabels: () => void;
		onDelete: () => void;
	};

	let {
		count,
		allSelected,
		busy = false,
		onSelectAll,
		onClear,
		onFavorite,
		onLabels,
		onDelete
	}: Props = $props();
</script>

<div
	class="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t bg-background/95 px-3 py-2 backdrop-blur md:bottom-0"
>
	<div class="mx-auto flex max-w-2xl flex-wrap items-center gap-2">
		<span class="mr-auto text-sm font-medium tabular-nums">
			{m.foods_selected_count({ count })}
		</span>
		<Button
			variant="ghost"
			size="sm"
			onclick={allSelected ? onClear : onSelectAll}
			aria-label={allSelected ? m.foods_select_none() : m.foods_select_all()}
		>
			{#if allSelected}
				<X class="size-4 sm:mr-1" />
			{:else}
				<CheckCheck class="size-4 sm:mr-1" />
			{/if}
			<span class="hidden sm:inline">
				{allSelected ? m.foods_select_none() : m.foods_select_all()}
			</span>
		</Button>
		<Button
			variant="outline"
			size="sm"
			disabled={busy || count === 0}
			aria-label={m.foods_bulk_favorite()}
			onclick={() => onFavorite(true)}
		>
			<Heart class="size-4" />
		</Button>
		<Button
			variant="outline"
			size="sm"
			disabled={busy || count === 0}
			aria-label={m.foods_bulk_unfavorite()}
			onclick={() => onFavorite(false)}
		>
			<HeartOff class="size-4" />
		</Button>
		<Button
			variant="outline"
			size="sm"
			disabled={busy || count === 0}
			aria-label={m.foods_bulk_labels()}
			onclick={onLabels}
		>
			<Tag class="size-4" />
		</Button>
		<Button
			variant="destructive"
			size="sm"
			disabled={busy || count === 0}
			aria-label={m.foods_delete()}
			onclick={onDelete}
		>
			<Trash2 class="size-4" />
		</Button>
	</div>
</div>
