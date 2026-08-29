<script lang="ts">
	import AiTaskCard from '$lib/components/ai-tasks/AiTaskCard.svelte';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import type { AiTask } from '$lib/services/ai-task-service.svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		tasks: AiTask[];
		onDismiss?: (id: string) => void;
		onDelete: (id: string) => void;
	};

	let { tasks, onDismiss, onDelete }: Props = $props();

	const pending = $derived(tasks.filter((t) => t.status === 'pending'));
	const dismissed = $derived(tasks.filter((t) => t.status === 'dismissed'));
	const completed = $derived(tasks.filter((t) => t.status === 'completed'));
	const hasUnread = $derived(dismissed.some((t) => !t.acknowledgedAt));

	let completedOpen = $state(false);
	// A dismissal is news; it should not be hidden behind a closed section.
	let dismissedOpen = $state(true);
</script>

{#if tasks.length === 0}
	<div class="flex flex-col items-center gap-3 py-12 text-center">
		<Sparkles class="size-16 text-muted-foreground/40" />
		<div class="space-y-1">
			<p class="font-medium">{m.ai_tasks_empty_title()}</p>
			<p class="mx-auto max-w-sm text-sm text-muted-foreground">
				{m.ai_tasks_empty_description()}
			</p>
		</div>
	</div>
{:else}
	<div class="space-y-5">
		<div class="space-y-2">
			<h2 class="text-sm font-medium text-muted-foreground">{m.ai_tasks_pending_title()}</h2>
			{#if pending.length === 0}
				<p
					class="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground"
				>
					{m.ai_tasks_pending_empty()}
				</p>
			{:else}
				<div class="space-y-2">
					{#each pending as task (task.id)}
						<AiTaskCard {task} {onDismiss} {onDelete} />
					{/each}
				</div>
			{/if}
		</div>

		{#if dismissed.length > 0}
			<Collapsible.Root bind:open={dismissedOpen}>
				<Collapsible.Trigger
					class="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm font-medium hover:bg-accent {hasUnread
						? 'text-violet-700 dark:text-violet-300'
						: 'text-muted-foreground'}"
				>
					<ChevronDown class="size-4 transition-transform [[data-state=closed]_&]:-rotate-90" />
					{m.ai_tasks_dismissed_title({ count: String(dismissed.length) })}
				</Collapsible.Trigger>
				<Collapsible.Content class="space-y-2 pt-2">
					{#each dismissed as task (task.id)}
						<AiTaskCard {task} {onDelete} />
					{/each}
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}

		{#if completed.length > 0}
			<Collapsible.Root bind:open={completedOpen}>
				<Collapsible.Trigger
					class="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
				>
					<ChevronDown class="size-4 transition-transform [[data-state=closed]_&]:-rotate-90" />
					{m.ai_tasks_completed_title({ count: String(completed.length) })}
				</Collapsible.Trigger>
				<Collapsible.Content class="space-y-2 pt-2">
					{#each completed as task (task.id)}
						<AiTaskCard {task} {onDelete} />
					{/each}
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}
	</div>
{/if}
