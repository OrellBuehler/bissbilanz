<script lang="ts" module>
	export type FoodThumbnailSize = 'xs' | 'sm' | 'md' | 'lg' | 'fill';
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { thumbnailInitial, thumbnailPalette } from '$lib/utils/thumbnail';

	type Props = {
		name: string;
		imageUrl?: string | null;
		/** `fill` stretches to the parent, which owns the aspect ratio and rounding. */
		size?: FoodThumbnailSize;
		class?: string;
	};

	let { name, imageUrl, size = 'md', class: className }: Props = $props();

	const SIZES: Record<FoodThumbnailSize, { box: string; text: string }> = {
		xs: { box: 'size-8 rounded-md', text: 'text-xs' },
		sm: { box: 'size-10 rounded-md', text: 'text-sm' },
		md: { box: 'size-12 rounded-lg', text: 'text-base' },
		lg: { box: 'size-16 rounded-xl', text: 'text-xl' },
		fill: { box: 'h-full w-full', text: 'text-4xl sm:text-5xl' }
	};

	const variant = $derived(SIZES[size]);
	const color = $derived(thumbnailPalette(name));
	const initial = $derived(thumbnailInitial(name));

	// Catalog and Open Food Facts URLs point at third-party hosts that can 404 or
	// be blocked by the CSP; fall back to the placeholder instead of a broken tile.
	let failedUrl = $state<string | null>(null);
	const src = $derived(imageUrl && imageUrl !== failedUrl ? imageUrl : null);
</script>

{#if src}
	<img
		{src}
		alt={name}
		loading="lazy"
		onerror={() => (failedUrl = src)}
		class={cn('shrink-0 overflow-hidden object-cover', variant.box, className)}
	/>
{:else}
	<div
		aria-hidden="true"
		class={cn(
			'flex shrink-0 items-center justify-center overflow-hidden',
			variant.box,
			color.bg,
			className
		)}
	>
		<span class={cn('font-bold leading-none', variant.text, color.text)}>{initial}</span>
	</div>
{/if}
