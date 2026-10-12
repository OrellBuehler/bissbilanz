<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import ResponsiveModal from '$lib/components/ui/responsive-modal/ResponsiveModal.svelte';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import ShieldOff from '@lucide/svelte/icons/shield-off';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open: boolean;
		grant: boolean;
		note: string | null;
		saving: boolean;
		onConfirm: (note: string | null) => void;
	};

	let { open = $bindable(false), grant, note, saving, onConfirm }: Props = $props();

	let text = $state('');

	$effect(() => {
		if (open) text = note ?? '';
	});

	const title = $derived(grant ? m.admin_user_grant() : m.admin_user_revoke());
</script>

<ResponsiveModal bind:open {title}>
	<div class="space-y-4 pb-2">
		<div class="space-y-2">
			<Label for="admin-access-note">{m.admin_user_note()}</Label>
			<Textarea
				id="admin-access-note"
				bind:value={text}
				maxlength={500}
				rows={3}
				placeholder={m.admin_user_note_placeholder()}
			/>
		</div>
		<div class="flex justify-end gap-2">
			<Button variant="outline" onclick={() => (open = false)} disabled={saving}>
				{m.cancel()}
			</Button>
			<Button
				variant={grant ? 'default' : 'destructive'}
				onclick={() => onConfirm(text.trim() || null)}
				disabled={saving}
			>
				{#if grant}
					<ShieldCheck class="size-4" />
				{:else}
					<ShieldOff class="size-4" />
				{/if}
				{title}
			</Button>
		</div>
	</div>
</ResponsiveModal>
