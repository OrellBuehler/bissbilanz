<script lang="ts">
	import { getSyncState, setFailedCount } from '$lib/stores/sync-state.svelte';
	import { retryFailed, discardFailed, countFailed } from '$lib/stores/offline-queue';
	import { syncQueue } from '$lib/stores/sync';
	import { Button } from '$lib/components/ui/button/index.js';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import * as m from '$lib/paraglide/messages';

	const sync = getSyncState();

	async function retry() {
		await retryFailed();
		setFailedCount(await countFailed());
		await syncQueue();
	}

	async function discard() {
		await discardFailed();
		setFailedCount(0);
	}
</script>

{#if sync.failedCount > 0}
	<div
		class="flex items-center justify-between gap-2 bg-destructive px-4 py-1 text-xs text-destructive-foreground"
	>
		<span class="flex items-center gap-2">
			<TriangleAlert class="h-3 w-3 shrink-0" />
			{m.sync_failed_banner({ count: sync.failedCount })}
		</span>
		<span class="flex shrink-0 gap-1">
			<Button size="sm" variant="ghost" class="h-6 px-2 text-xs" onclick={retry}>
				{m.sync_failed_retry()}
			</Button>
			<Button size="sm" variant="ghost" class="h-6 px-2 text-xs" onclick={discard}>
				{m.sync_failed_discard()}
			</Button>
		</span>
	</div>
{/if}
