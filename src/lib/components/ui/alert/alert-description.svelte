<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert-description"
	class={cn(
		'text-muted-foreground col-start-2 grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-start gap-1 text-sm [&_p]:leading-relaxed',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
