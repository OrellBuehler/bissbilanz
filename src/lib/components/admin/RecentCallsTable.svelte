<script lang="ts">
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as m from '$lib/paraglide/messages';
	import type { AdminUserDetail } from './admin-api';
	import { formatDateTime, formatUsd } from './format';

	type Call = AdminUserDetail['recentCalls'][number];

	let { calls }: { calls: Call[] } = $props();

	const statusLabels: Record<string, () => string> = {
		succeeded: () => m.admin_call_status_succeeded(),
		failed: () => m.admin_call_status_failed(),
		reserved: () => m.admin_call_status_reserved(),
		abandoned: () => m.admin_call_status_abandoned()
	};

	const taskStatusLabels: Record<string, () => string> = {
		pending: () => m.ai_tasks_status_pending(),
		completed: () => m.ai_tasks_status_completed(),
		dismissed: () => m.ai_tasks_status_dismissed()
	};

	const statusLabel = (status: string) => statusLabels[status]?.() ?? status;
	const taskStatusLabel = (status: string) => taskStatusLabels[status]?.() ?? status;

	const statusVariant = (status: string): BadgeVariant =>
		status === 'succeeded' ? 'secondary' : status === 'reserved' ? 'outline' : 'destructive';

	const tokens = (call: Call) =>
		m.admin_user_tokens({
			input: call.inputTokens,
			output: call.outputTokens,
			cached: call.cacheReadInputTokens + call.cacheCreationInputTokens
		});
</script>

{#if calls.length === 0}
	<p class="text-muted-foreground py-6 text-center text-sm">{m.admin_user_calls_empty()}</p>
{:else}
	<div class="space-y-2 xl:hidden">
		{#each calls as call (call.id)}
			<div class="space-y-1 rounded-lg border p-3 text-sm" data-testid="admin-call-card">
				<div class="flex items-center justify-between gap-2">
					<span class="text-muted-foreground text-xs">{formatDateTime(call.createdAt)}</span>
					<Badge variant={statusVariant(call.status)}>{statusLabel(call.status)}</Badge>
				</div>
				<div class="flex items-center justify-between gap-2">
					<span class="min-w-0 truncate">{call.feature} · {call.model}</span>
					<span class="font-medium tabular-nums">{formatUsd(call.costUsd)}</span>
				</div>
				<div class="text-muted-foreground text-xs tabular-nums">{tokens(call)}</div>
				{#if call.aiTaskStatus}
					<div class="text-muted-foreground text-xs">
						{m.admin_user_col_task()}: {taskStatusLabel(call.aiTaskStatus)}
					</div>
				{/if}
				{#if call.errorCode}
					<div class="text-destructive text-xs">{call.errorCode}</div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="hidden rounded-xl border xl:block">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.admin_user_col_time()}</Table.Head>
					<Table.Head>{m.admin_user_col_feature()}</Table.Head>
					<Table.Head>{m.admin_user_col_model()}</Table.Head>
					<Table.Head>{m.admin_user_col_status()}</Table.Head>
					<Table.Head>{m.admin_user_col_tokens()}</Table.Head>
					<Table.Head class="text-right">{m.admin_user_col_cost()}</Table.Head>
					<Table.Head>{m.admin_user_col_task()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each calls as call (call.id)}
					<Table.Row data-testid="admin-call-row">
						<Table.Cell class="whitespace-nowrap">{formatDateTime(call.createdAt)}</Table.Cell>
						<Table.Cell>{call.feature}</Table.Cell>
						<Table.Cell class="font-mono text-xs">{call.model}</Table.Cell>
						<Table.Cell>
							<div class="flex flex-col items-start gap-1">
								<Badge variant={statusVariant(call.status)}>{statusLabel(call.status)}</Badge>
								{#if call.errorCode}
									<span class="text-destructive text-xs">{call.errorCode}</span>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell class="text-xs tabular-nums whitespace-nowrap">{tokens(call)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatUsd(call.costUsd)}</Table.Cell>
						<Table.Cell>
							{#if call.aiTaskStatus}
								<Badge variant="outline">{taskStatusLabel(call.aiTaskStatus)}</Badge>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}
