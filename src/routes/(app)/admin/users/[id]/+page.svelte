<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/stores';
	import * as Sentry from '@sentry/sveltekit';
	import { toast } from 'svelte-sonner';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import AccessDialog from '$lib/components/admin/AccessDialog.svelte';
	import AccessHistory from '$lib/components/admin/AccessHistory.svelte';
	import BudgetInput from '$lib/components/admin/BudgetInput.svelte';
	import RecentCallsTable from '$lib/components/admin/RecentCallsTable.svelte';
	import UserUsageChart from '$lib/components/admin/UserUsageChart.svelte';
	import {
		fetchUserDetail,
		AdminRequestError,
		isUnexpectedFailure,
		patchClaudeAccess,
		runOptimistic,
		type AdminClaudeAccessUpdate,
		type AdminUserDetail
	} from '$lib/components/admin/admin-api';
	import { formatDate, formatUsd, initialOf, providerLabel } from '$lib/components/admin/format';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import ShieldOff from '@lucide/svelte/icons/shield-off';
	import * as m from '$lib/paraglide/messages';

	const RANGES = [7, 30, 90];

	const id = $derived($page.params.id ?? '');

	let detail = $state<AdminUserDetail | null>(null);
	let days = $state(30);
	let failed = $state(false);
	let notFound = $state(false);
	let saving = $state(false);
	let dialogOpen = $state(false);
	let defaultBudget = $state<number | null>(null);
	let sequence = 0;

	async function load(userId: string, range: number) {
		const current = ++sequence;
		failed = false;
		notFound = false;
		try {
			const result = await fetchUserDetail(userId, range);
			if (current !== sequence) return;
			detail = result;
			learnDefaultBudget(result.user.claude);
		} catch (error) {
			if (current !== sequence) return;
			if (error instanceof AdminRequestError && error.status === 404) {
				notFound = true;
				return;
			}
			failed = true;
			if (isUnexpectedFailure(error)) Sentry.captureException(error);
		}
	}

	function learnDefaultBudget(claude: {
		monthlyBudgetUsd: number | null;
		effectiveBudgetUsd: number;
	}) {
		if (claude.monthlyBudgetUsd === null) defaultBudget = claude.effectiveBudgetUsd;
	}

	$effect(() => {
		const userId = id;
		untrack(() => {
			detail = null;
			defaultBudget = null;
			void load(userId, days);
		});
	});

	function changeRange(value: string) {
		days = Number(value);
		void load(id, days);
	}

	async function save(body: AdminClaudeAccessUpdate, apply: () => void, rollback: () => void) {
		if (!detail || saving) return false;
		saving = true;
		try {
			const access = await runOptimistic({
				apply,
				rollback,
				request: () => patchClaudeAccess(id, body)
			});
			detail.user.claude.enabled = access.enabled;
			detail.user.claude.monthlyBudgetUsd = access.monthlyBudgetUsd;
			detail.user.claude.effectiveBudgetUsd = access.effectiveBudgetUsd;
			detail.user.claude.note = access.note;
			learnDefaultBudget(detail.user.claude);
			toast.success(m.admin_saved(), { duration: 1500 });
			void load(id, days);
			return true;
		} catch (error) {
			if (isUnexpectedFailure(error)) Sentry.captureException(error);
			toast.error(m.admin_save_failed());
			return false;
		} finally {
			saving = false;
		}
	}

	async function confirmAccess(note: string | null) {
		if (!detail) return;
		const ok = await save(
			{ enabled: !detail.user.claude.enabled, note },
			() => {},
			() => {}
		);
		if (ok) dialogOpen = false;
	}

	async function saveBudget(monthlyBudgetUsd: number | null) {
		if (!detail) return;
		const claude = detail.user.claude;
		const previous = claude.monthlyBudgetUsd;
		await save(
			{ monthlyBudgetUsd },
			() => (claude.monthlyBudgetUsd = monthlyBudgetUsd),
			() => (claude.monthlyBudgetUsd = previous)
		);
	}

	const rangeLabel = (range: number) => m.admin_user_usage_range({ days: range });
</script>

<div class="mx-auto max-w-5xl space-y-6">
	<Button variant="ghost" size="sm" href="/admin" class="-ml-2">
		<ArrowLeft class="size-4" />
		{m.admin_title()}
	</Button>

	{#if failed}
		<div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
			<CircleAlert class="size-4 text-destructive" />
			<span>{m.admin_load_failed()}</span>
			<Button variant="outline" size="sm" onclick={() => load(id, days)}>
				<RefreshCw class="size-4" />
				{m.admin_retry()}
			</Button>
		</div>
	{:else if notFound}
		<p class="text-muted-foreground py-8 text-center text-sm">{m.admin_users_empty()}</p>
	{:else if !detail}
		<div class="space-y-3">
			<Skeleton class="h-16 w-full" />
			<Skeleton class="h-56 w-full" />
		</div>
	{:else}
		{@const user = detail.user}
		<Card.Root data-testid="admin-user-header">
			<Card.Content class="space-y-4">
				<div class="flex items-center gap-3">
					<Avatar.Root class="size-12 shrink-0">
						{#if user.avatarUrl}
							<Avatar.Image src={user.avatarUrl} alt={user.name ?? user.email ?? ''} />
						{/if}
						<Avatar.Fallback>{initialOf(user)}</Avatar.Fallback>
					</Avatar.Root>
					<div class="min-w-0 flex-1">
						<h1 class="truncate text-lg font-semibold">{user.name || user.email || user.id}</h1>
						{#if user.name && user.email}
							<div class="text-muted-foreground truncate text-sm">{user.email}</div>
						{/if}
					</div>
					{#if user.isAdmin}
						<Badge variant="outline">{m.nav_admin()}</Badge>
					{/if}
				</div>

				<div class="flex flex-wrap gap-1">
					{#each user.providers as provider (provider)}
						<Badge variant="secondary">{providerLabel(provider)}</Badge>
					{/each}
				</div>

				<dl class="grid grid-cols-2 gap-x-3 gap-y-3 text-sm sm:grid-cols-4">
					<div>
						<dt class="text-muted-foreground text-xs">{m.admin_users_col_created()}</dt>
						<dd>{user.createdAt ? formatDate(user.createdAt) : m.admin_users_never()}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-xs">{m.admin_users_col_last_active()}</dt>
						<dd>{user.lastActiveAt ? formatDate(user.lastActiveAt) : m.admin_users_never()}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-xs">{m.admin_users_col_entries()}</dt>
						<dd class="tabular-nums">{user.entryCount}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-xs">{m.admin_users_col_open_tasks()}</dt>
						<dd class="tabular-nums">{user.openAiTaskCount}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-xs">{m.admin_users_col_spend()}</dt>
						<dd class="tabular-nums">
							{formatUsd(user.claude.monthSpendUsd)}
							<span class="text-muted-foreground text-xs">
								· {m.admin_users_calls({ count: user.claude.monthCalls })}
							</span>
						</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-xs">{m.admin_users_col_budget()}</dt>
						<dd>
							<BudgetInput
								value={user.claude.monthlyBudgetUsd}
								{defaultBudget}
								disabled={saving}
								class="h-8 w-40 text-sm tabular-nums"
								onSave={saveBudget}
							/>
						</dd>
					</div>
					<div class="col-span-2">
						<dt class="text-muted-foreground text-xs">{m.admin_user_note()}</dt>
						<dd class="break-words">{user.claude.note || '—'}</dd>
					</div>
				</dl>

				<div class="flex items-center justify-between gap-3 border-t pt-4">
					<div class="flex items-center gap-2 text-sm font-medium">
						{#if user.claude.enabled}
							<ShieldCheck class="size-4 text-green-600" />
						{:else}
							<ShieldOff class="text-muted-foreground size-4" />
						{/if}
						{m.admin_users_col_access()}
					</div>
					<Button
						variant={user.claude.enabled ? 'outline' : 'default'}
						disabled={saving}
						onclick={() => (dialogOpen = true)}
					>
						{user.claude.enabled ? m.admin_user_revoke() : m.admin_user_grant()}
					</Button>
				</div>
			</Card.Content>
		</Card.Root>

		<section class="space-y-3">
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-base font-semibold">{m.admin_user_usage_title()}</h2>
				<Select.Root type="single" value={String(days)} onValueChange={changeRange}>
					<Select.Trigger class="w-44" aria-label={m.admin_user_usage_title()}>
						<span>{rangeLabel(days)}</span>
					</Select.Trigger>
					<Select.Content>
						{#each RANGES as range (range)}
							<Select.Item value={String(range)}>{rangeLabel(range)}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<Card.Root>
				<Card.Content>
					<UserUsageChart usage={detail.dailyUsage} />
				</Card.Content>
			</Card.Root>
		</section>

		<section class="space-y-3">
			<h2 class="text-base font-semibold">{m.admin_user_calls_title()}</h2>
			<RecentCallsTable calls={detail.recentCalls} />
		</section>

		<section class="space-y-3">
			<h2 class="text-base font-semibold">{m.admin_user_history_title()}</h2>
			<AccessHistory entries={detail.auditLog} {defaultBudget} />
		</section>

		<AccessDialog
			bind:open={dialogOpen}
			grant={!user.claude.enabled}
			note={user.claude.note}
			{saving}
			onConfirm={confirmAccess}
		/>
	{/if}
</div>
