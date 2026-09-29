<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ListTree from '@lucide/svelte/icons/list-tree';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open: boolean;
		count: number;
		description: string;
		// Replaces the default title and explains why force is unavailable.
		title?: string;
		note?: string;
		forceDisabled?: boolean;
		usageLabel?: string;
		onShowUsage?: () => void;
		onConfirm: () => void;
		onCancel: () => void;
	};

	let {
		open = $bindable(),
		count,
		description,
		title,
		note,
		forceDisabled = false,
		usageLabel,
		onShowUsage,
		onConfirm,
		onCancel
	}: Props = $props();
</script>

<AlertDialog.Root
	{open}
	onOpenChange={(v) => {
		if (!v) onCancel();
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title class="text-left">{title ?? m.delete_related_entries()}</AlertDialog.Title>
			<AlertDialog.Description>
				{@html description}
			</AlertDialog.Description>
			{#if note}
				<p class="text-sm text-destructive">{note}</p>
			{/if}
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={onCancel}>
				{m.cancel()}
			</AlertDialog.Cancel>
			{#if onShowUsage}
				<AlertDialog.Action class={buttonVariants({ variant: 'outline' })} onclick={onShowUsage}>
					<ListTree class="size-4" />
					{usageLabel}
				</AlertDialog.Action>
			{/if}
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				onclick={onConfirm}
				disabled={forceDisabled}
			>
				<Trash2 class="size-4" />
				{m.delete_related_entries()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
