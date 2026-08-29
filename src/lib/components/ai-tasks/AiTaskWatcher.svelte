<script lang="ts">
	// Surfaces AI tasks the assistant dismissed. Dismissals are the only outcome
	// the user has to hear about — a completion speaks for itself as new diary
	// entries. There is no push infrastructure, so this polls on the same signals
	// the rest of the app already refreshes on: mount and tab refocus.
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { aiTaskService } from '$lib/services/ai-task-service.svelte';
	import * as m from '$lib/paraglide/messages';

	async function check() {
		await aiTaskService.refresh();
		const fresh = await aiTaskService.collectNewDismissals();
		for (const task of fresh) {
			const body = task.resultSummary ?? m.ai_tasks_notification_body_fallback();
			toast.info(m.ai_tasks_notification_title(), {
				description: body,
				action: {
					label: m.ai_tasks_notification_view(),
					onClick: () => goto('/ai-tasks')
				}
			});
			await aiTaskService.showSystemNotification(m.ai_tasks_notification_title(), body);
		}
	}

	onMount(() => {
		void check();

		const onVisible = () => {
			if (document.visibilityState === 'visible') void check();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});
</script>
