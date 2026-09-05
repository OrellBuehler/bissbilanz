<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import MessageSquareText from '@lucide/svelte/icons/message-square-text';
	import { formatDateLabel, formatTime } from '$lib/utils/dates';
	import type { AiTask } from '$lib/services/ai-task-service.svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		task: AiTask;
		onDismiss?: (id: string) => void;
		onDelete: (id: string) => void;
	};

	let { task, onDismiss, onDelete }: Props = $props();

	const isUnread = $derived(task.status === 'dismissed' && !task.acknowledgedAt);

	const statusLabel = $derived(
		task.status === 'completed'
			? m.ai_tasks_status_completed()
			: task.status === 'dismissed'
				? m.ai_tasks_status_dismissed()
				: m.ai_tasks_status_pending()
	);
</script>

<Card.Root class={isUnread ? 'ring-2 ring-violet-300/80 dark:ring-violet-700/80' : undefined}>
	<Card.Content class="flex gap-3 py-3">
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
			<div class="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
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
		</div>

		<div class="flex shrink-0 flex-col gap-1">
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
	</Card.Content>
</Card.Root>
