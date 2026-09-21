<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import FoodThumbnail from '$lib/components/shared/FoodThumbnail.svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		name: string;
		imageUrl?: string | null;
		uploading?: boolean;
		onUpload: (file: File) => Promise<void> | void;
		/** Omitted where there is nothing to detach from, e.g. a read-only preview. */
		onRemove?: () => Promise<void> | void;
	};

	let { name, imageUrl, uploading = false, onUpload, onRemove }: Props = $props();

	const inputId = $props.id();
</script>

<div class="space-y-2">
	<div class="relative aspect-video w-full max-w-sm overflow-hidden rounded-xl border">
		<FoodThumbnail {name} {imageUrl} size="fill" />
		{#if uploading}
			<div class="absolute inset-0 flex items-center justify-center bg-background/60">
				<Spinner class="size-8" />
			</div>
		{/if}
	</div>
	<Label for={inputId}>{m.image_upload_label()}</Label>
	<div class="mt-1 flex items-center gap-2">
		<input
			id={inputId}
			type="file"
			accept="image/*"
			disabled={uploading}
			onchange={async (e) => {
				const input = e.currentTarget;
				const file = input.files?.[0];
				if (!file) return;
				await onUpload(file);
				input.value = '';
			}}
			class="block min-w-0 flex-1 text-sm file:mr-4 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
		/>
		{#if imageUrl && onRemove}
			<Button
				type="button"
				variant="outline"
				size="sm"
				class="shrink-0"
				disabled={uploading}
				aria-label={m.image_remove()}
				onclick={() => onRemove?.()}
			>
				<Trash2 class="size-4 sm:mr-1" />
				<span class="hidden sm:inline">{m.image_remove()}</span>
			</Button>
		{/if}
	</div>
</div>
