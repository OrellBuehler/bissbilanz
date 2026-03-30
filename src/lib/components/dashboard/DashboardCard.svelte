<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	type Tone = 'neutral' | 'primary' | 'tertiary';

	type Props = {
		title: string;
		Icon: any;
		tone?: Tone;
		class?: string;
		contentClass?: string;
		headerRight?: Snippet;
		children: Snippet;
	};

	let {
		title,
		Icon,
		tone = 'neutral',
		class: className,
		contentClass,
		headerRight,
		children
	}: Props = $props();

	const toneClasses: Record<Tone, { badge: string; title: string; shell: string }> = {
		neutral: {
			badge: 'bg-muted text-muted-foreground',
			title: 'text-foreground',
			shell: 'bg-card'
		},
		primary: {
			badge: 'bg-primary/10 text-primary',
			title: 'text-foreground',
			shell: 'bg-card'
		},
		tertiary: {
			badge: 'bg-tertiary/10 text-tertiary',
			title: 'text-foreground',
			shell: 'bg-card'
		}
	};
</script>

<Card.Root
	class={cn(
		'gap-0 overflow-hidden rounded-2xl border border-border/40 shadow-sm',
		toneClasses[tone].shell,
		className
	)}
>
	<div class="flex items-start justify-between gap-3 px-4 pt-3 pb-2 sm:px-5 sm:pt-3.5 sm:pb-2.5">
		<div class="min-w-0 flex items-center gap-2.5">
			<div
				class={cn(
					'flex size-8 shrink-0 items-center justify-center rounded-lg',
					toneClasses[tone].badge
				)}
			>
				<Icon class="size-4" />
			</div>
			<div class="min-w-0">
				<div class={cn('truncate text-sm font-medium', toneClasses[tone].title)}>
					{title}
				</div>
			</div>
		</div>
		{#if headerRight}
			<div class="shrink-0">
				{@render headerRight()}
			</div>
		{/if}
	</div>

	<div class={cn('px-4 pb-3 sm:px-5 sm:pb-3.5', contentClass)}>
		{@render children()}
	</div>
</Card.Root>
