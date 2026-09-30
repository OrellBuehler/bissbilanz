<script lang="ts">
	import AiTaskCard from '$lib/components/ai-tasks/AiTaskCard.svelte';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import type { AiTask } from '$lib/services/ai-task-service.svelte';
	import * as m from '$lib/paraglide/messages';
	import ListPagination from '$lib/components/shared/ListPagination.svelte';

	type Props = {
		tasks: AiTask[];
		onEdit?: (task: AiTask) => void;
		onDismiss?: (id: string) => void;
		onDelete: (id: string) => void;
	};

	let { tasks, onEdit, onDismiss, onDelete }: Props = $props();

	const pending = $derived(tasks.filter((t) => t.status === 'pending'));
	const dismissed = $derived(tasks.filter((t) => t.status === 'dismissed'));
	const completed = $derived(tasks.filter((t) => t.status === 'completed'));
	const hasUnread = $derived(dismissed.some((t) => !t.acknowledgedAt));

	const PER_PAGE = 10;
	let pendingPage = $state(1);
	let dismissedPage = $state(1);
	let completedPage = $state(1);
	const pageOf = (list: AiTask[], page: number) =>
		list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

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
					{#each pageOf(pending, pendingPage) as task (task.id)}
						<AiTaskCard {task} {onEdit} {onDismiss} {onDelete} />
					{/each}
					<ListPagination
						count={pending.length}
						perPage={PER_PAGE}
						bind:page={pendingPage}
						class="mt-2"
					/>
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
					{#each pageOf(dismissed, dismissedPage) as task (task.id)}
						<AiTaskCard {task} {onDelete} />
					{/each}
					<ListPagination
						count={dismissed.length}
						perPage={PER_PAGE}
						bind:page={dismissedPage}
						class="mt-2"
					/>
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
					{#each pageOf(completed, completedPage) as task (task.id)}
						<AiTaskCard {task} {onDelete} />
					{/each}
					<ListPagination
						count={completed.length}
						perPage={PER_PAGE}
						bind:page={completedPage}
						class="mt-2"
					/>
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}
	</div>
{/if}
