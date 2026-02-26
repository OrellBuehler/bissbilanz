<script lang="ts">
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		onDelete: () => void;
		title?: string;
		description?: string;
		class?: string;
	};

	let { onDelete, title, description, class: className }: Props = $props();

	let open = $state(false);
</script>

<Button
	variant="ghost"
	size="icon"
	class="shrink-0 text-destructive hover:text-destructive {className}"
	onclick={(e: MouseEvent) => {
		e.stopPropagation();
		open = true;
	}}
	aria-label={title ?? m.confirm_delete_title()}
>
	<Trash2 class="size-4" />
</Button>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title ?? m.confirm_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{description ?? m.confirm_delete_description()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => (open = false)}>
				{m.cancel()}
			</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				onclick={() => {
					open = false;
					onDelete();
				}}
			>
				<Trash2 class="size-4" />
				{title ?? m.confirm_delete_title()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
