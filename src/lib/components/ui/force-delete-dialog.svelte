<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open: boolean;
		count: number;
		description: string;
		onConfirm: () => void;
		onCancel: () => void;
	};

	let { open = $bindable(), count, description, onConfirm, onCancel }: Props = $props();
</script>

<AlertDialog.Root
	{open}
	onOpenChange={(v) => {
		if (!v) onCancel();
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title class="text-left">{m.delete_related_entries()}</AlertDialog.Title>
			<AlertDialog.Description>
				{@html description}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={onCancel}>
				{m.cancel()}
			</AlertDialog.Cancel>
			<AlertDialog.Action class={buttonVariants({ variant: 'destructive' })} onclick={onConfirm}>
				<Trash2 class="size-4" />
				{m.delete_related_entries()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
