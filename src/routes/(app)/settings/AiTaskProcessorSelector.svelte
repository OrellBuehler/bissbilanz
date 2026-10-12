<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { toast } from 'svelte-sonner';
	import * as Sentry from '@sentry/sveltekit';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import * as m from '$lib/paraglide/messages';
	import { formatUsd } from '$lib/components/admin/format';
	import {
		claudeOption as resolveClaudeOption,
		type AiProcessor as AiTaskProcessor,
		type ClaudeCapability
	} from '$lib/utils/claude-tasks';

	type Props = {
		initialProcessor: AiTaskProcessor | null | undefined;
		initialAutoLog: boolean | null | undefined;
		claude?: ClaudeCapability | null;
		onSave: (values: {
			aiTaskProcessor: AiTaskProcessor;
			aiTaskAutoLog: boolean;
		}) => Promise<boolean>;
	};

	let { initialProcessor, initialAutoLog, claude = null, onSave }: Props = $props();

	let processor = $state<AiTaskProcessor>('assistant');
	let autoLog = $state(false);

	$effect(() => {
		if (initialProcessor) processor = initialProcessor;
		if (initialAutoLog != null) autoLog = initialAutoLog;
	});

	const claudeOption = $derived(resolveClaudeOption(processor, claude));

	const processorLabel = (value: AiTaskProcessor) =>
		value === 'device'
			? m.settings_ai_task_processor_device()
			: value === 'claude'
				? claudeOption === 'unavailable'
					? m.settings_ai_task_processor_claude_unavailable()
					: m.settings_ai_task_processor_claude()
				: m.settings_ai_task_processor_assistant();

	async function save(next: { aiTaskProcessor: AiTaskProcessor; aiTaskAutoLog: boolean }) {
		try {
			const ok = await onSave(next);
			if (ok) toast.success(m.settings_saved(), { duration: 1500 });
			else toast.error(m.settings_save_failed());
		} catch (err) {
			Sentry.captureException(err);
			toast.error(m.settings_save_failed());
		}
	}

	function selectProcessor(value: string) {
		if (value === 'claude' && claudeOption !== 'selectable') return;
		const next: AiTaskProcessor =
			value === 'device' ? 'device' : value === 'claude' ? 'claude' : 'assistant';
		processor = next;
		save({ aiTaskProcessor: next, aiTaskAutoLog: autoLog });
	}

	function toggleAutoLog(checked: boolean) {
		autoLog = checked;
		save({ aiTaskProcessor: processor, aiTaskAutoLog: checked });
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.settings_ai_task_processor_title()}</Card.Title>
		<Card.Description>{m.settings_ai_task_processor_desc()}</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<div class="grid gap-1.5">
			<Label for="ai-task-processor">{m.settings_ai_task_processor_label()}</Label>
			<Select.Root type="single" value={processor} onValueChange={selectProcessor}>
				<Select.Trigger id="ai-task-processor" class="w-full">
					{processorLabel(processor)}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="assistant">{m.settings_ai_task_processor_assistant()}</Select.Item>
					<Select.Item value="device">{m.settings_ai_task_processor_device()}</Select.Item>
					{#if claudeOption !== 'hidden'}
						<Select.Item value="claude" disabled={claudeOption === 'unavailable'}>
							{claudeOption === 'unavailable'
								? m.settings_ai_task_processor_claude_unavailable()
								: m.settings_ai_task_processor_claude()}
						</Select.Item>
					{/if}
				</Select.Content>
			</Select.Root>
		</div>

		{#if claudeOption === 'unavailable'}
			<p
				class="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
				data-testid="claude-unavailable-hint"
			>
				<TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
				{m.settings_ai_task_processor_claude_unavailable_hint()}
			</p>
		{:else if claudeOption === 'selectable'}
			<p class="text-xs text-muted-foreground" data-testid="claude-privacy-note">
				{m.settings_ai_task_processor_claude_privacy()}
			</p>
			{#if processor === 'claude' && claude?.remainingBudgetUsd != null}
				<p class="text-xs text-muted-foreground" data-testid="claude-remaining-budget">
					{m.settings_ai_task_processor_claude_remaining({
						amount: formatUsd(claude.remainingBudgetUsd)
					})}
				</p>
			{/if}
		{/if}

		{#if processor === 'device'}
			<p class="text-muted-foreground text-xs">
				{m.settings_ai_task_processor_device_hint()}
			</p>
		{/if}

		{#if processor === 'device' || processor === 'claude'}
			<div class="flex items-center justify-between gap-3 rounded-md border p-3">
				<div class="space-y-0.5">
					<Label for="ai-task-auto-log">{m.settings_ai_task_auto_log_label()}</Label>
					<p class="text-xs text-muted-foreground">
						{#if processor === 'claude'}
							{autoLog ? m.ai_tasks_capture_hint_claude() : m.ai_tasks_capture_hint_claude_review()}
						{:else}
							{m.settings_ai_task_auto_log_hint()}
						{/if}
					</p>
				</div>
				<Switch id="ai-task-auto-log" checked={autoLog} onCheckedChange={toggleAutoLog} />
			</div>
		{/if}
	</Card.Content>
</Card.Root>
