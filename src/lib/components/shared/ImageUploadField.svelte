<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import FoodThumbnail from '$lib/components/shared/FoodThumbnail.svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		name: string;
		imageUrl?: string | null;
		uploading?: boolean;
		onUpload: (file: File) => Promise<void> | void;
	};

	let { name, imageUrl, uploading = false, onUpload }: Props = $props();

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
		class="mt-1 block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
	/>
</div>
