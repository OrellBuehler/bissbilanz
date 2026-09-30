<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import ForceDeleteDialog from '$lib/components/ui/force-delete-dialog.svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open: boolean;
		selectedCount: number;
		blockedCount: number;
		onDelete: () => void;
		onForceDelete: () => void;
		onCancelBlocked: () => void;
	};

	let {
		open = $bindable(),
		selectedCount,
		blockedCount,
		onDelete,
		onForceDelete,
		onCancelBlocked
	}: Props = $props();
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title class="text-left">
				{m.foods_bulk_delete_title({ count: selectedCount })}
			</AlertDialog.Title>
			<AlertDialog.Description>{m.foods_bulk_delete_description()}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action class={buttonVariants({ variant: 'destructive' })} onclick={onDelete}>
				{m.foods_delete()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<ForceDeleteDialog
	open={blockedCount > 0}
	count={blockedCount}
	description={m.foods_bulk_delete_blocked({ count: blockedCount })}
	onConfirm={onForceDelete}
	onCancel={onCancelBlocked}
/>
