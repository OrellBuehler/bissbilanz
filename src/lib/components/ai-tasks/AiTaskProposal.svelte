<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import MacroValue from '$lib/components/shared/MacroValue.svelte';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';
	import { aiTaskService, type AiTask } from '$lib/services/ai-task-service.svelte';
	import {
		acceptBody,
		initialSelection,
		proposalKey,
		reconcileSelection,
		toggleSelection
	} from '$lib/utils/claude-tasks';
	import * as m from '$lib/paraglide/messages';

	type Proposal = NonNullable<NonNullable<AiTask['claudeProcessing']>['proposal']>;

	type Props = {
		taskId: string;
		proposal: Proposal;
		onDiscard: (id: string) => void | Promise<void>;
	};

	let { taskId, proposal, onDiscard }: Props = $props();

	const key = $derived(proposalKey(proposal.items));
	let selection = $state(initialSelection(untrack(() => proposal.items)));
	const selected = $derived(selection.selected);

	$effect.pre(() => {
		void key;
		selection = reconcileSelection(
			untrack(() => selection),
			untrack(() => proposal.items)
		);
	});

	let accepting = $state(false);
	let discarding = $state(false);
	const working = $derived(accepting || discarding);
	let message = $state<string | null>(null);

	const toggle = (id: string) => {
		selection = { ...selection, selected: toggleSelection(selected, id) };
		message = null;
	};

	const accept = async () => {
		const body = acceptBody(proposal.items, selected);
		if (!body) {
			message = m.ai_tasks_proposal_none_selected();
			return;
		}
		message = null;
		accepting = true;
		try {
			const result = await aiTaskService.acceptProposal(taskId, body);
			if (result === 'logged') toast.success(m.ai_tasks_proposal_logged());
			else if (result === 'conflict') toast.error(m.ai_tasks_proposal_accept_conflict());
			else toast.error(m.ai_tasks_proposal_accept_failed());
		} finally {
			accepting = false;
		}
	};

	const discard = async () => {
		message = null;
		discarding = true;
		try {
			await onDiscard(taskId);
		} finally {
			discarding = false;
		}
	};
</script>

<div
	class="space-y-3 rounded-lg border border-blue-300/60 bg-blue-50/50 p-3 dark:border-blue-800/60 dark:bg-blue-950/20"
	data-testid="ai-task-proposal"
>
	<div class="space-y-0.5">
		<p class="text-sm font-medium">{m.ai_tasks_proposal_title()}</p>
		{#if proposal.summary}
			<p class="text-xs break-words text-muted-foreground">{proposal.summary}</p>
		{/if}
	</div>

	<ul class="space-y-2">
		{#each proposal.items as item (item.id)}
			<li>
				<label class="flex cursor-pointer items-start gap-3 py-1">
					<Checkbox
						class="mt-0.5"
						aria-label={item.name}
						checked={selected.has(item.id)}
						onCheckedChange={() => toggle(item.id)}
						disabled={working}
					/>
					<span class="min-w-0 flex-1 space-y-0.5">
						<span class="block text-sm font-medium break-words">{item.name}</span>
						{#if item.quantityDescription}
							<span class="block text-xs break-words text-muted-foreground">
								{item.quantityDescription}
							</span>
						{/if}
						<span class="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
							<MacroValue macro="calories" value={item.calories} unit="kcal" />
							<MacroValue macro="protein" value={item.protein} suffix="P" />
							<MacroValue macro="carbs" value={item.carbs} suffix="C" />
							<MacroValue macro="fat" value={item.fat} suffix="F" />
							<MacroValue macro="fiber" value={item.fiber} suffix="Fi" />
						</span>
					</span>
				</label>
			</li>
		{/each}
	</ul>

	{#if message}
		<p class="text-xs text-destructive" role="alert">{message}</p>
	{/if}

	<div class="flex gap-2">
		<Button variant="outline" class="flex-1" disabled={working} onclick={discard}>
			{#if discarding}
				<Spinner class="mr-1 size-4" />
			{:else}
				<X class="mr-1 size-4" />
			{/if}
			{m.ai_tasks_proposal_discard()}
		</Button>
		<Button class="flex-1" disabled={working} onclick={accept}>
			{#if accepting}
				<Spinner class="mr-1 size-4" />
			{:else}
				<Check class="mr-1 size-4" />
			{/if}
			{m.ai_tasks_proposal_log()}
		</Button>
	</div>
</div>
