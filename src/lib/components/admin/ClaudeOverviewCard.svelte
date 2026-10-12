<script lang="ts">
	import { onMount } from 'svelte';
	import * as Sentry from '@sentry/sveltekit';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import * as m from '$lib/paraglide/messages';
	import {
		fetchClaudeOverview,
		isUnexpectedFailure,
		patchKillSwitch,
		runOptimistic,
		type AdminClaudeOverview
	} from './admin-api';
	import { formatUsd } from './format';

	let { onLoad }: { onLoad?: (overview: AdminClaudeOverview) => void } = $props();

	let overview = $state<AdminClaudeOverview | null>(null);
	let failed = $state(false);
	let saving = $state(false);
	let confirmOpen = $state(false);

	async function load() {
		failed = false;
		try {
			overview = await fetchClaudeOverview();
			onLoad?.(overview);
		} catch (error) {
			failed = true;
			if (isUnexpectedFailure(error)) Sentry.captureException(error);
		}
	}

	async function setEnabled(enabled: boolean) {
		if (!overview || saving) return;
		const current = overview;
		const previous = current.enabled;
		saving = true;
		try {
			await runOptimistic({
				apply: () => (current.enabled = enabled),
				rollback: () => (current.enabled = previous),
				request: () => patchKillSwitch(enabled)
			});
			toast.success(m.admin_saved(), { duration: 1500 });
		} catch (error) {
			if (isUnexpectedFailure(error)) Sentry.captureException(error);
			toast.error(m.admin_save_failed());
		} finally {
			saving = false;
		}
	}

	function requestEnabled(enabled: boolean) {
		if (enabled) void setEnabled(true);
		else confirmOpen = true;
	}

	onMount(load);

	const ratio = $derived(
		overview && overview.globalBudgetUsd > 0 ? overview.monthSpendUsd / overview.globalBudgetUsd : 0
	);
	const runStats = $derived(
		overview
			? [
					{ label: m.admin_claude_runs_queued(), value: overview.runs.queued },
					{ label: m.admin_claude_runs_running(), value: overview.runs.running },
					{ label: m.admin_claude_runs_retrying(), value: overview.runs.retryWait },
					{ label: m.admin_claude_runs_blocked(), value: overview.runs.blocked },
					{ label: m.admin_claude_runs_proposed(), value: overview.runs.proposed },
					{ label: m.admin_claude_runs_dismissed(), value: overview.runs.dismissedThisMonth }
				]
			: []
	);
</script>

<Card.Root data-testid="admin-claude-card">
	<Card.Header>
		<div class="flex flex-wrap items-center justify-between gap-2">
			<Card.Title>{m.admin_claude_title()}</Card.Title>
			{#if overview}
				<Badge variant={overview.configured ? 'secondary' : 'destructive'}>
					<KeyRound />
					{overview.configured ? m.admin_claude_configured() : m.admin_claude_not_configured()}
				</Badge>
			{/if}
		</div>
	</Card.Header>
	<Card.Content class="space-y-5">
		{#if failed}
			<div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
				<CircleAlert class="size-4 text-destructive" />
				<span>{m.admin_load_failed()}</span>
				<Button variant="outline" size="sm" onclick={load}>
					<RefreshCw class="size-4" />
					{m.admin_retry()}
				</Button>
			</div>
		{:else if !overview}
			<div class="space-y-3">
				<Skeleton class="h-6 w-1/2" />
				<Skeleton class="h-2 w-full" />
				<Skeleton class="h-16 w-full" />
			</div>
		{:else}
			<div class="flex items-center justify-between gap-3">
				<Label for="admin-claude-kill-switch" class="text-sm font-medium">
					{m.admin_claude_kill_switch()}
				</Label>
				<Switch
					id="admin-claude-kill-switch"
					disabled={saving}
					bind:checked={() => overview!.enabled, requestEnabled}
				/>
			</div>

			<div class="space-y-2">
				<div class="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
					<span class="font-medium tabular-nums" data-testid="admin-claude-spend">
						{m.admin_claude_month_spend({
							spent: formatUsd(overview.monthSpendUsd),
							budget: formatUsd(overview.globalBudgetUsd)
						})}
					</span>
					<span class="text-muted-foreground tabular-nums">
						{m.admin_users_calls({ count: overview.monthCalls })}
						{#if overview.openReservations > 0}
							· {m.admin_claude_open_reservations({ count: overview.openReservations })}
						{/if}
					</span>
				</div>
				<Progress
					value={Math.min(overview.monthSpendUsd, overview.globalBudgetUsd)}
					max={overview.globalBudgetUsd || 1}
					class={ratio >= 0.9
						? 'bg-destructive/20 [&>[data-slot=progress-indicator]]:bg-destructive'
						: ''}
				/>
			</div>

			<dl class="flex items-center justify-between gap-3 text-sm">
				<dt class="text-muted-foreground">{m.admin_claude_model()}</dt>
				<dd class="truncate font-mono text-xs" data-testid="admin-claude-model">
					{overview.model}
				</dd>
			</dl>

			<div class="space-y-2">
				<h3 class="text-sm font-medium">{m.admin_claude_runs_title()}</h3>
				<div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
					{#each runStats as stat (stat.label)}
						<div class="rounded-lg border px-2 py-1.5 text-center">
							<div class="text-base font-semibold tabular-nums">{stat.value}</div>
							<div class="text-muted-foreground text-[11px] leading-tight">{stat.label}</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="space-y-2">
				<h3 class="text-sm font-medium">{m.admin_claude_top_users()}</h3>
				{#if overview.topUsers.length === 0}
					<p class="text-muted-foreground text-sm">{m.admin_claude_top_users_empty()}</p>
				{:else}
					<ul class="divide-y rounded-lg border">
						{#each overview.topUsers as user, index (user.userId ?? `deleted-${index}`)}
							<li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
								{#if user.userId}
									<a href="/admin/users/{user.userId}" class="min-w-0 truncate hover:underline">
										{user.name || user.email || user.userId}
									</a>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
								<span class="shrink-0 tabular-nums">
									{formatUsd(user.spendUsd)}
									<span class="text-muted-foreground">
										· {m.admin_users_calls({ count: user.calls })}
									</span>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title class="text-left">{m.admin_claude_kill_switch()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.admin_claude_kill_switch_confirm_off()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				onclick={() => {
					confirmOpen = false;
					void setEnabled(false);
				}}
			>
				{m.admin_claude_kill_switch_stop()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
