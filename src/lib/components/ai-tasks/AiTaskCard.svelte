<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';
	import Pencil from '@lucide/svelte/icons/pencil';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import MessageSquareText from '@lucide/svelte/icons/message-square-text';
	import Clock from '@lucide/svelte/icons/clock';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import AiTaskProposal from './AiTaskProposal.svelte';
	import { claudeChipState, isProcessedByClaude, type ClaudeState } from '$lib/utils/claude-tasks';
	import { formatDateLabel, formatTime } from '$lib/utils/dates';
	import type { AiTask } from '$lib/services/ai-task-service.svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		task: AiTask;
		onEdit?: (task: AiTask) => void;
		onDismiss?: (id: string) => void | Promise<void>;
		onDelete: (id: string) => void;
	};

	let { task, onEdit, onDismiss, onDelete }: Props = $props();

	const isUnread = $derived(task.status === 'dismissed' && !task.acknowledgedAt);

	const statusLabel = $derived(
		task.status === 'completed'
			? m.ai_tasks_status_completed()
			: task.status === 'dismissed'
				? m.ai_tasks_status_dismissed()
				: m.ai_tasks_status_pending()
	);

	const processedByLabel = $derived(
		task.status === 'pending'
			? null
			: isProcessedByClaude(task)
				? m.ai_tasks_processed_by_claude()
				: task.processedBy === 'assistant'
					? m.ai_tasks_processed_by_assistant()
					: task.processedBy === 'on_device'
						? m.ai_tasks_processed_by_on_device()
						: task.processedBy === 'private_cloud'
							? m.ai_tasks_processed_by_private_cloud()
							: null
	);

	const chipState = $derived(task.status === 'pending' ? claudeChipState(task) : null);
	const proposal = $derived(
		chipState === 'proposed' ? (task.claudeProcessing?.proposal ?? null) : null
	);

	const chipLabels: Record<ClaudeState, () => string> = {
		queued: () => m.ai_tasks_claude_state_queued(),
		running: () => m.ai_tasks_claude_state_running(),
		retrying: () => m.ai_tasks_claude_state_retrying(),
		proposed: () => m.ai_tasks_claude_state_proposed(),
		blocked: () => m.ai_tasks_claude_state_blocked()
	};
</script>

<Card.Root class={isUnread ? 'ring-2 ring-violet-300/80 dark:ring-violet-700/80' : undefined}>
	<Card.Content class="space-y-3 py-3">
		<div class="flex gap-3">
			{#if task.photoUrls.length > 0}
				<div class="relative size-16 shrink-0">
					<img src={task.photoUrls[0]} alt="" class="size-16 rounded-lg border object-cover" />
					{#if task.photoUrls.length > 1}
						<span
							class="absolute right-1 bottom-1 rounded bg-background/85 px-1 text-[0.65rem] font-medium tabular-nums"
						>
							+{task.photoUrls.length - 1}
						</span>
					{/if}
				</div>
			{:else}
				<div
					class="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-muted/40"
				>
					<Sparkles class="size-6 text-muted-foreground/50" />
				</div>
			{/if}

			<div class="min-w-0 flex-1 space-y-1.5">
				<div class="flex flex-wrap items-center gap-1.5">
					<Badge variant="outline">
						{formatDateLabel(task.date)}{task.eatenAt ? ` · ${formatTime(task.eatenAt)}` : ''}
					</Badge>
					{#if task.mealType}
						<Badge variant="outline">{task.mealType}</Badge>
					{/if}
					{#if task.status === 'completed'}
						<Badge
							variant="outline"
							class="border-green-300/60 text-green-700 dark:border-green-700/60 dark:text-green-400"
						>
							<CircleCheck class="size-3" />
							{statusLabel}
						</Badge>
					{:else if task.status === 'dismissed'}
						<Badge variant="outline" class="text-muted-foreground">{statusLabel}</Badge>
					{/if}
					{#if chipState && !proposal}
						<Badge
							variant="outline"
							class="max-w-full whitespace-normal {chipState === 'blocked'
								? 'border-amber-500/50 text-amber-700 dark:text-amber-400'
								: 'border-blue-300/60 text-blue-700 dark:border-blue-700/60 dark:text-blue-300'}"
							data-testid="ai-task-claude-state"
							data-state={chipState}
						>
							{#if chipState === 'running'}
								<LoaderCircle class="animate-spin" />
							{:else if chipState === 'retrying'}
								<RotateCw />
							{:else if chipState === 'blocked'}
								<TriangleAlert />
							{:else if chipState === 'proposed'}
								<Sparkles />
							{:else}
								<Clock />
							{/if}
							{chipLabels[chipState]()}
						</Badge>
					{/if}
					{#if isUnread}
						<Badge
							class="border-transparent bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
						>
							{m.ai_tasks_unread()}
						</Badge>
					{/if}
				</div>

				{#if task.description}
					<p class="line-clamp-2 text-sm">{task.description}</p>
				{:else}
					<p class="text-sm text-muted-foreground italic">
						{task.photoUrls.length > 1
							? m.ai_tasks_photos_only({ count: String(task.photoUrls.length) })
							: m.ai_tasks_photo_only()}
					</p>
				{/if}

				{#if task.resultSummary}
					{#if task.status === 'dismissed'}
						<div class="rounded-md border border-border/70 bg-muted/40 p-2">
							<p
								class="flex items-center gap-1 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase"
							>
								<MessageSquareText class="size-3" />
								{m.ai_tasks_agent_comment()}
							</p>
							<p class="mt-1 text-sm break-words">{task.resultSummary}</p>
						</div>
					{:else}
						<p class="line-clamp-2 text-xs text-muted-foreground">{task.resultSummary}</p>
					{/if}
				{/if}

				{#if processedByLabel}
					<p class="text-xs text-muted-foreground">{processedByLabel}</p>
				{/if}
			</div>

			<div class="flex shrink-0 flex-col gap-1">
				{#if task.status === 'pending' && onEdit}
					<Button
						variant="ghost"
						size="icon"
						class="size-8"
						onclick={() => onEdit(task)}
						aria-label={m.ai_tasks_edit()}
					>
						<Pencil class="size-4" />
					</Button>
				{/if}
				{#if task.status === 'pending' && onDismiss}
					<Button
						variant="ghost"
						size="icon"
						class="size-8"
						onclick={() => onDismiss(task.id)}
						aria-label={m.ai_tasks_dismiss()}
					>
						<X class="size-4" />
					</Button>
				{/if}
				<DeleteButton
					onDelete={() => onDelete(task.id)}
					title={m.ai_tasks_delete()}
					description={m.ai_tasks_delete_confirm()}
					class="size-8"
				/>
			</div>
		</div>

		{#if proposal}
			<AiTaskProposal taskId={task.id} {proposal} onDiscard={(id) => onDismiss?.(id)} />
		{/if}
	</Card.Content>
</Card.Root>
