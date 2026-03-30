<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	type Tone = 'neutral' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet';

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
			shell: 'bg-surface-container-low'
		},
		blue: {
			badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
			title: 'text-foreground',
			shell:
				'bg-gradient-to-b from-blue-50/30 to-surface-container-low dark:from-blue-950/15 dark:to-card'
		},
		emerald: {
			badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
			title: 'text-foreground',
			shell:
				'bg-gradient-to-b from-emerald-50/30 to-surface-container-low dark:from-emerald-950/15 dark:to-card'
		},
		amber: {
			badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
			title: 'text-foreground',
			shell:
				'bg-gradient-to-b from-amber-50/30 to-surface-container-low dark:from-amber-950/15 dark:to-card'
		},
		rose: {
			badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
			title: 'text-foreground',
			shell:
				'bg-gradient-to-b from-rose-50/30 to-surface-container-low dark:from-rose-950/15 dark:to-card'
		},
		violet: {
			badge: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
			title: 'text-foreground',
			shell:
				'bg-gradient-to-b from-violet-50/30 to-surface-container-low dark:from-violet-950/15 dark:to-card'
		}
	};
</script>

<Card.Root
	class={cn(
		'gap-0 overflow-hidden rounded-2xl border-0 shadow-none',
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
