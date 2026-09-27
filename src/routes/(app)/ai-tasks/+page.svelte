<script lang="ts">
	import { onMount } from 'svelte';
	import * as Sentry from '@sentry/sveltekit';
	import { Button } from '$lib/components/ui/button/index.js';
	import AiTaskCaptureModal from '$lib/components/ai-tasks/AiTaskCaptureModal.svelte';
	import AiTaskList from '$lib/components/ai-tasks/AiTaskList.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Bell from '@lucide/svelte/icons/bell';
	import { aiTaskService, type AiTask } from '$lib/services/ai-task-service.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import HintCard from '$lib/components/help/HintCard.svelte';
	import { isDismissed } from '$lib/stores/hints.svelte';

	let captureOpen = $state(false);
	let editOpen = $state(false);
	let editingTask = $state<AiTask | null>(null);

	const editTask = (task: AiTask) => {
		editingTask = task;
		editOpen = true;
	};
	let notificationPermission = $state<NotificationPermission | 'unsupported'>('unsupported');

	const cachedPrefs = useLiveQuery(() => preferencesService.preferences(), undefined);
	const aiTaskProcessor = $derived(
		cachedPrefs.value?.aiTaskProcessor === 'device' ? 'device' : 'assistant'
	);
	const pageDescription = $derived(
		aiTaskProcessor === 'device'
			? m.ai_tasks_page_description_device()
			: m.ai_tasks_page_description()
	);

	const requestNotifications = async () => {
		try {
			notificationPermission = await Notification.requestPermission();
		} catch (err) {
			Sentry.captureException(err);
			toast.error(m.error_generic());
		}
	};

	const dismissTask = async (id: string) => {
		try {
			await aiTaskService.updateStatus(id, 'dismissed');
		} catch (err) {
			Sentry.captureException(err, { extra: { id } });
			toast.error(m.error_generic());
		}
	};

	const deleteTask = async (id: string) => {
		try {
			await aiTaskService.remove(id);
		} catch (err) {
			Sentry.captureException(err, { extra: { id } });
			toast.error(m.error_generic());
		}
	};

	onMount(async () => {
		notificationPermission =
			typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
		preferencesService.refresh();
		await aiTaskService.refresh();
		// Opening the list is what counts as reading it — posting a notification
		// does not, so other devices still get to announce the same dismissal.
		await aiTaskService.acknowledgeAll();
	});
</script>

<div class="mx-auto max-w-2xl space-y-4">
	{#if !isDismissed('ai-assistant')}
		<HintCard
			id="ai-assistant"
			title={m.hint_ai_assistant_title()}
			text={m.hint_ai_assistant_body()}
			href="/help/ai-assistant"
		/>
	{/if}

	<div class="flex items-center justify-between gap-2">
		<p class="text-sm text-muted-foreground">{pageDescription}</p>
		<Button size="sm" onclick={() => (captureOpen = true)}>
			<Plus class="mr-1.5 size-4" />
			{m.ai_tasks_capture_button()}
		</Button>
	</div>

	{#if notificationPermission === 'default'}
		<div
			class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2"
		>
			<p class="text-sm text-muted-foreground">{m.ai_tasks_notifications_hint()}</p>
			<Button size="sm" variant="outline" onclick={requestNotifications}>
				<Bell class="mr-1.5 size-4" />
				{m.ai_tasks_enable_notifications()}
			</Button>
		</div>
	{:else if notificationPermission === 'denied'}
		<p class="text-xs text-muted-foreground">{m.ai_tasks_notifications_blocked()}</p>
	{/if}

	<AiTaskList
		tasks={aiTaskService.tasks}
		onEdit={editTask}
		onDismiss={dismissTask}
		onDelete={deleteTask}
	/>
</div>

<AiTaskCaptureModal
	bind:open={captureOpen}
	{aiTaskProcessor}
	onCreated={() => aiTaskService.refresh()}
/>
<AiTaskCaptureModal bind:open={editOpen} task={editingTask} {aiTaskProcessor} />
