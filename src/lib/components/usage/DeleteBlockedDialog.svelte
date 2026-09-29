<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import ListTree from '@lucide/svelte/icons/list-tree';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open: boolean;
		title: string;
		description: string;
		actionLabel: string;
		onAction: () => void;
		onClose: () => void;
	};

	let { open, title, description, actionLabel, onAction, onClose }: Props = $props();
</script>

<AlertDialog.Root
	{open}
	onOpenChange={(v) => {
		if (!v) onClose();
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title class="text-left">{title}</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={onClose}>{m.usage_close()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={onAction}>
				<ListTree class="size-4" />
				{actionLabel}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
