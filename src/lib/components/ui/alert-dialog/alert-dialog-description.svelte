<script lang="ts">
	import type { Snippet } from 'svelte';
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: AlertDialogPrimitive.DescriptionProps & { children?: Snippet } = $props();
</script>

{#if children}
	<AlertDialogPrimitive.Description
		bind:ref
		data-slot="alert-dialog-description"
		class={cn('text-muted-foreground text-sm', className)}
		{...restProps}
	>
		{@render children()}
	</AlertDialogPrimitive.Description>
{:else}
	<AlertDialogPrimitive.Description
		bind:ref
		data-slot="alert-dialog-description"
		class={cn('text-muted-foreground text-sm', className)}
		{...restProps}
	/>
{/if}
