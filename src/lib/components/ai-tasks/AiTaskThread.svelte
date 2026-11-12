<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { aiTaskService, type AiTask } from '$lib/services/ai-task-service.svelte';
	import { isCorrectionActive } from '$lib/utils/claude-tasks';
	import * as m from '$lib/paraglide/messages';

	const MAX_CHARS = 1000;

	type Props = { task: AiTask };

	let { task }: Props = $props();

	const thread = $derived(task.claudeThread);
	const working = $derived(isCorrectionActive(task));

	let text = $state('');
	let sending = $state(false);
	// One key per reply, kept for a retry after a network failure so the server
	// answers it from the first attempt instead of recording the reply twice.
	let pending = $state<{ key: string; text: string } | null>(null);

	const blockedText = (reason: string | null | undefined) => {
		switch (reason) {
			case 'reply_limit_reached':
				return m.ai_tasks_reply_blocked_limit();
			case 'rate_limited':
				return m.ai_tasks_reply_blocked_rate();
			case 'processor_unavailable':
				return m.ai_tasks_reply_blocked_unavailable();
			case 'budget_exhausted':
				return m.ai_tasks_reply_blocked_budget();
			default:
				return m.ai_tasks_reply_blocked_other();
		}
	};

	const send = async (event: SubmitEvent) => {
		event.preventDefault();
		const reply = text.trim();
		if (!reply || sending) return;
		if (reply.length > MAX_CHARS) {
			toast.error(m.ai_tasks_reply_too_long({ max: String(MAX_CHARS) }));
			return;
		}
		const key = pending?.text === reply ? pending.key : crypto.randomUUID();
		pending = { key, text: reply };
		sending = true;
		try {
			const result = await aiTaskService.reply(task.id, reply, key);
			if (result === 'sent') {
				text = '';
				pending = null;
			} else if (result === 'offline') {
				toast.error(m.ai_tasks_reply_offline());
			} else if (result === 'failed') {
				toast.error(m.ai_tasks_reply_error());
			} else {
				pending = null;
				toast.error(blockedText(result));
			}
		} finally {
			sending = false;
		}
	};
</script>

{#if thread}
	<div class="space-y-3 border-t border-border/60 pt-3" data-testid="ai-task-thread">
		{#if thread.messages.length > 0}
			<ol class="space-y-2">
				{#each thread.messages as message (message.id)}
					{#if message.role === 'user'}
						<li class="ml-8 rounded-lg bg-muted px-3 py-2" data-role="user">
							<p class="text-[0.7rem] font-medium text-muted-foreground">
								{m.ai_tasks_reply_you()}
							</p>
							<p class="text-sm break-words whitespace-pre-line">{message.text}</p>
						</li>
					{:else}
						<li
							class="mr-8 rounded-lg border px-3 py-2 {message.outcome === 'failed'
								? 'border-amber-500/40 bg-amber-500/5'
								: 'border-violet-300/60 bg-violet-50/60 dark:border-violet-800/60 dark:bg-violet-950/20'}"
							data-role="assistant"
							data-outcome={message.outcome}
						>
							<div class="flex flex-wrap items-center gap-1.5">
								<p
									class="flex items-center gap-1 text-[0.7rem] font-medium text-violet-700 dark:text-violet-300"
								>
									<Sparkles class="size-3" />
									{m.ai_tasks_reply_claude()}
								</p>
								{#if message.outcome === 'changed'}
									<Badge
										variant="outline"
										class="border-green-300/60 text-green-700 dark:border-green-700/60 dark:text-green-400"
									>
										<CircleCheck />
										{m.ai_tasks_reply_changed()}
									</Badge>
								{:else if message.outcome === 'failed'}
									<Badge
										variant="outline"
										class="border-amber-500/50 text-amber-700 dark:text-amber-400"
									>
										<TriangleAlert />
										{m.ai_tasks_reply_failed()}
									</Badge>
								{/if}
								{#if message.unread}
									<Badge
										class="border-transparent bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
									>
										{m.ai_tasks_unread()}
									</Badge>
								{/if}
							</div>
							<p class="mt-0.5 text-sm break-words whitespace-pre-line">{message.text}</p>
						</li>
					{/if}
				{/each}
			</ol>
		{/if}

		{#if working}
			<p
				class="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300"
				role="status"
				data-testid="ai-task-reply-working"
			>
				<LoaderCircle class="size-3.5 animate-spin" />
				{m.ai_tasks_reply_working()}
			</p>
		{:else if thread.canReply}
			<form class="space-y-2" onsubmit={send}>
				<Textarea
					bind:value={text}
					rows={2}
					maxlength={MAX_CHARS}
					placeholder={m.ai_tasks_reply_placeholder()}
					aria-label={m.ai_tasks_reply_label()}
					disabled={sending}
					class="min-h-16 text-sm"
				/>
				<div class="flex items-start justify-between gap-2">
					<p class="text-xs text-muted-foreground">{m.ai_tasks_reply_hint()}</p>
					<Button
						type="submit"
						size="sm"
						class="shrink-0"
						disabled={sending || text.trim().length === 0}
					>
						{#if sending}
							<Spinner class="mr-1 size-4" />
						{:else}
							<SendHorizontal class="mr-1 size-4" />
						{/if}
						{m.ai_tasks_reply_send()}
					</Button>
				</div>
			</form>
		{:else if thread.replyBlockedReason && thread.replyBlockedReason !== 'not_completed'}
			<p class="text-xs text-muted-foreground" data-testid="ai-task-reply-blocked">
				{blockedText(thread.replyBlockedReason)}
			</p>
		{/if}
	</div>
{/if}
