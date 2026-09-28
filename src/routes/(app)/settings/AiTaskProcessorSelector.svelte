<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { toast } from 'svelte-sonner';
	import * as Sentry from '@sentry/sveltekit';
	import * as m from '$lib/paraglide/messages';

	type AiTaskProcessor = 'assistant' | 'device';

	type Props = {
		initialProcessor: AiTaskProcessor | null | undefined;
		initialAutoLog: boolean | null | undefined;
		onSave: (values: {
			aiTaskProcessor: AiTaskProcessor;
			aiTaskAutoLog: boolean;
		}) => Promise<boolean>;
	};

	let { initialProcessor, initialAutoLog, onSave }: Props = $props();

	let processor = $state<AiTaskProcessor>('assistant');
	let autoLog = $state(false);

	$effect(() => {
		if (initialProcessor) processor = initialProcessor;
		if (initialAutoLog != null) autoLog = initialAutoLog;
	});

	const processorLabel = (value: AiTaskProcessor) =>
		value === 'device'
			? m.settings_ai_task_processor_device()
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
		const next = value === 'device' ? 'device' : 'assistant';
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
				</Select.Content>
			</Select.Root>
		</div>

		{#if processor === 'device'}
			<p class="text-muted-foreground text-xs">
				{m.settings_ai_task_processor_device_hint()}
			</p>
			<div class="flex items-center justify-between gap-3 rounded-md border p-3">
				<div class="space-y-0.5">
					<Label for="ai-task-auto-log">{m.settings_ai_task_auto_log_label()}</Label>
					<p class="text-xs text-muted-foreground">{m.settings_ai_task_auto_log_hint()}</p>
				</div>
				<Switch id="ai-task-auto-log" checked={autoLog} onCheckedChange={toggleAutoLog} />
			</div>
		{/if}
	</Card.Content>
</Card.Root>
