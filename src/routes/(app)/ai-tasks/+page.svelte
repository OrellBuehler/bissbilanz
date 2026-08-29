<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import AiTaskCaptureModal from '$lib/components/ai-tasks/AiTaskCaptureModal.svelte';
	import AiTaskList from '$lib/components/ai-tasks/AiTaskList.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Bell from '@lucide/svelte/icons/bell';
	import { aiTaskService } from '$lib/services/ai-task-service.svelte';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';

	let captureOpen = $state(false);
	let notificationPermission = $state<NotificationPermission | 'unsupported'>('unsupported');

	const requestNotifications = async () => {
		try {
			notificationPermission = await Notification.requestPermission();
		} catch {
			toast.error(m.error_generic());
		}
	};

	const dismissTask = async (id: string) => {
		try {
			await aiTaskService.updateStatus(id, 'dismissed');
		} catch {
			toast.error(m.error_generic());
		}
	};

	const deleteTask = async (id: string) => {
		try {
			await aiTaskService.remove(id);
		} catch {
			toast.error(m.error_generic());
		}
	};

	onMount(async () => {
		notificationPermission =
			typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
		await aiTaskService.refresh();
		// Opening the list is what counts as reading it — posting a notification
		// does not, so other devices still get to announce the same dismissal.
		await aiTaskService.acknowledgeAll();
	});
</script>

<div class="mx-auto max-w-2xl space-y-4">
	<div class="flex items-center justify-between gap-2">
		<p class="text-sm text-muted-foreground">{m.ai_tasks_page_description()}</p>
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

	<AiTaskList tasks={aiTaskService.tasks} onDismiss={dismissTask} onDelete={deleteTask} />
</div>

<AiTaskCaptureModal bind:open={captureOpen} onCreated={() => aiTaskService.refresh()} />
