<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import AiTaskCaptureModal from '$lib/components/ai-tasks/AiTaskCaptureModal.svelte';
	import AiTaskList from '$lib/components/ai-tasks/AiTaskList.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import { aiTaskService } from '$lib/services/ai-task-service.svelte';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';

	let captureOpen = $state(false);

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

	onMount(() => {
		aiTaskService.refresh();
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

	<AiTaskList tasks={aiTaskService.tasks} onDismiss={dismissTask} onDelete={deleteTask} />
</div>

<AiTaskCaptureModal bind:open={captureOpen} onCreated={() => aiTaskService.refresh()} />
