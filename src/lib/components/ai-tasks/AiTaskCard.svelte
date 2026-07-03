<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import { formatDateLabel } from '$lib/utils/dates';
	import type { AiTask } from '$lib/services/ai-task-service.svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		task: AiTask;
		onDismiss?: (id: string) => void;
		onDelete: (id: string) => void;
	};

	let { task, onDismiss, onDelete }: Props = $props();

	const statusLabel = $derived(
		task.status === 'completed'
			? m.ai_tasks_status_completed()
			: task.status === 'dismissed'
				? m.ai_tasks_status_dismissed()
				: m.ai_tasks_status_pending()
	);
</script>

<Card.Root>
	<Card.Content class="flex gap-3 py-3">
		{#if task.photoUrl}
			<img src={task.photoUrl} alt="" class="size-16 shrink-0 rounded-lg border object-cover" />
		{:else}
			<div class="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
				<Sparkles class="size-6 text-muted-foreground/50" />
			</div>
		{/if}

		<div class="min-w-0 flex-1 space-y-1.5">
			<div class="flex flex-wrap items-center gap-1.5">
				<Badge variant="outline">{formatDateLabel(task.date)}</Badge>
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
			</div>

			{#if task.description}
				<p class="line-clamp-2 text-sm">{task.description}</p>
			{:else}
				<p class="text-sm text-muted-foreground italic">{m.ai_tasks_photo_only()}</p>
			{/if}

			{#if task.resultSummary}
				<p class="line-clamp-2 text-xs text-muted-foreground">{task.resultSummary}</p>
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
