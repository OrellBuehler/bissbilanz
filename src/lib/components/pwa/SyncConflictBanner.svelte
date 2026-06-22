<script lang="ts">
	import { getSyncState, clearSyncConflicts } from '$lib/stores/sync-state.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import Info from '@lucide/svelte/icons/info';
	import * as m from '$lib/paraglide/messages';

	const sync = getSyncState();
</script>

{#if sync.conflicts.length > 0}
	<div
		class="flex items-center justify-between gap-2 bg-muted px-4 py-1 text-xs text-muted-foreground"
	>
		<span class="flex min-w-0 items-center gap-2">
			<Info class="h-3 w-3 shrink-0" />
			<span class="truncate">
				{m.sync_conflict_banner({ count: sync.conflicts.length })} — {sync.conflicts[0]}
			</span>
		</span>
		<Button
			size="sm"
			variant="ghost"
			class="h-6 shrink-0 px-2 text-xs"
			onclick={clearSyncConflicts}
		>
			{m.sync_conflict_dismiss()}
		</Button>
	</div>
{/if}
