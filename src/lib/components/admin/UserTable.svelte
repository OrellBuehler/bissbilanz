<script lang="ts">
	import { untrack } from 'svelte';
	import * as Sentry from '@sentry/sveltekit';
	import { toast } from 'svelte-sonner';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import ListPagination from '$lib/components/shared/ListPagination.svelte';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Search from '@lucide/svelte/icons/search';
	import * as m from '$lib/paraglide/messages';
	import {
		fetchUsers,
		isUnexpectedFailure,
		patchClaudeAccess,
		runOptimistic,
		type AdminClaudeAccessUpdate,
		type AdminUserAccessFilter,
		type AdminUserRow,
		type AdminUserSort
	} from './admin-api';
	import BudgetInput from './BudgetInput.svelte';
	import { formatDate, formatUsd, initialOf, providerLabel } from './format';

	let { defaultBudget }: { defaultBudget: number | null } = $props();

	const PER_PAGE = 25;

	let qInput = $state('');
	let q = $state('');
	let access = $state<NonNullable<AdminUserAccessFilter>>('all');
	let sort = $state<NonNullable<AdminUserSort>>('createdAt');
	let order = $state<'asc' | 'desc'>('desc');
	let page = $state(1);

	let rows = $state<AdminUserRow[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let failed = $state(false);
	let saving = $state<string[]>([]);
	let sequence = 0;

	const accessOptions = $derived([
		{ value: 'all', label: m.admin_users_filter_all() },
		{ value: 'enabled', label: m.admin_users_filter_enabled() },
		{ value: 'disabled', label: m.admin_users_filter_disabled() }
	]);

	const sortOptions = $derived([
		{ value: 'createdAt', label: m.admin_users_col_created() },
		{ value: 'lastActiveAt', label: m.admin_users_col_last_active() },
		{ value: 'name', label: m.admin_users_col_user() },
		{ value: 'entryCount', label: m.admin_users_col_entries() },
		{ value: 'monthSpendUsd', label: m.admin_users_col_spend() }
	]);

	async function load(params: {
		q: string;
		access: typeof access;
		sort: typeof sort;
		order: typeof order;
		page: number;
	}) {
		const current = ++sequence;
		loading = true;
		failed = false;
		try {
			const result = await fetchUsers({
				q: params.q,
				access: params.access,
				sort: params.sort,
				order: params.order,
				limit: PER_PAGE,
				offset: (params.page - 1) * PER_PAGE
			});
			if (current !== sequence) return;
			rows = result.users;
			total = result.total;
		} catch (error) {
			if (current !== sequence) return;
			failed = true;
			if (isUnexpectedFailure(error)) Sentry.captureException(error);
		} finally {
			if (current === sequence) loading = false;
		}
	}

	$effect(() => {
		const value = qInput;
		const timer = setTimeout(() => {
			if (q !== value) {
				q = value;
				page = 1;
			}
		}, 300);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const params = { q, access, sort, order, page };
		untrack(() => void load(params));
	});

	function changeAccessFilter(value: string) {
		access = value as typeof access;
		page = 1;
	}

	function changeSort(value: string) {
		sort = value as typeof sort;
		page = 1;
	}

	function toggleSort(column: typeof sort) {
		if (sort === column) {
			order = order === 'asc' ? 'desc' : 'asc';
		} else {
			sort = column;
			order = column === 'name' ? 'asc' : 'desc';
		}
		page = 1;
	}

	function flipOrder() {
		order = order === 'asc' ? 'desc' : 'asc';
		page = 1;
	}

	async function update(
		row: AdminUserRow,
		body: AdminClaudeAccessUpdate,
		apply: () => void,
		rollback: () => void
	) {
		if (saving.includes(row.id)) return;
		saving = [...saving, row.id];
		try {
			const updated = await runOptimistic({
				apply,
				rollback,
				request: () => patchClaudeAccess(row.id, body)
			});
			row.claude.enabled = updated.enabled;
			row.claude.monthlyBudgetUsd = updated.monthlyBudgetUsd;
			row.claude.effectiveBudgetUsd = updated.effectiveBudgetUsd;
			row.claude.note = updated.note;
			toast.success(m.admin_saved(), { duration: 1500 });
		} catch (error) {
			if (isUnexpectedFailure(error)) Sentry.captureException(error);
			toast.error(m.admin_save_failed());
		} finally {
			saving = saving.filter((id) => id !== row.id);
		}
	}

	function setEnabled(row: AdminUserRow, enabled: boolean) {
		const previous = row.claude.enabled;
		return update(
			row,
			{ enabled },
			() => (row.claude.enabled = enabled),
			() => (row.claude.enabled = previous)
		);
	}

	function setBudget(row: AdminUserRow, monthlyBudgetUsd: number | null) {
		const previous = row.claude.monthlyBudgetUsd;
		return update(
			row,
			{ monthlyBudgetUsd },
			() => (row.claude.monthlyBudgetUsd = monthlyBudgetUsd),
			() => (row.claude.monthlyBudgetUsd = previous)
		);
	}

	const displayName = (row: AdminUserRow) => row.name || row.email || row.id;

	const sortIcon = (column: typeof sort) =>
		sort !== column ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
</script>

{#snippet userCell(row: AdminUserRow)}
	<div class="flex min-w-0 items-center gap-3">
		<Avatar.Root class="size-9 shrink-0">
			{#if row.avatarUrl}
				<Avatar.Image src={row.avatarUrl} alt={row.name ?? row.email ?? ''} />
			{/if}
			<Avatar.Fallback>{initialOf(row)}</Avatar.Fallback>
		</Avatar.Root>
		<div class="min-w-0">
			<a
				href="/admin/users/{row.id}"
				class="block truncate text-sm font-medium hover:underline"
				data-testid="admin-user-link"
			>
				{row.name || row.email || row.id}
			</a>
			{#if row.name && row.email}
				<div class="text-muted-foreground truncate text-xs">{row.email}</div>
			{/if}
		</div>
		{#if row.isAdmin}
			<Badge variant="outline" class="shrink-0">{m.nav_admin()}</Badge>
		{/if}
	</div>
{/snippet}

{#snippet providerBadges(row: AdminUserRow)}
	<div class="flex flex-wrap gap-1">
		{#each row.providers as provider (provider)}
			<Badge variant="secondary">{providerLabel(provider)}</Badge>
		{/each}
	</div>
{/snippet}

{#snippet accessSwitch(row: AdminUserRow)}
	<Switch
		aria-label={m.admin_users_access_for({ user: displayName(row) })}
		disabled={saving.includes(row.id)}
		bind:checked={() => row.claude.enabled, (value) => void setEnabled(row, value)}
	/>
{/snippet}

{#snippet budgetField(row: AdminUserRow)}
	<BudgetInput
		value={row.claude.monthlyBudgetUsd}
		{defaultBudget}
		label={m.admin_users_budget_for({ user: displayName(row) })}
		disabled={saving.includes(row.id)}
		class="h-8 w-40 text-right text-sm tabular-nums"
		onSave={(value) => setBudget(row, value)}
	/>
{/snippet}

{#snippet spend(row: AdminUserRow)}
	<div class="tabular-nums">
		<div class="text-sm font-medium">{formatUsd(row.claude.monthSpendUsd)}</div>
		<div class="text-muted-foreground text-xs">
			{m.admin_users_calls({ count: row.claude.monthCalls })}
		</div>
	</div>
{/snippet}

{#snippet sortHeader(column: typeof sort, label: string, align: 'left' | 'right' = 'left')}
	{@const Icon = sortIcon(column)}
	<Button
		variant="ghost"
		size="sm"
		class="-mx-2 h-8 gap-1 px-2 font-medium {align === 'right' ? 'ml-auto' : ''}"
		onclick={() => toggleSort(column)}
	>
		{label}
		<Icon class="size-3.5 {sort === column ? '' : 'opacity-40'}" />
	</Button>
{/snippet}

<section class="space-y-4" data-testid="admin-user-list">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-lg font-semibold">
			{m.admin_users_title()}
			<span class="text-muted-foreground text-sm font-normal tabular-nums">
				· {m.admin_users_total({ count: total })}
			</span>
		</h2>
	</div>

	<div class="flex flex-col gap-2 sm:flex-row">
		<div class="relative flex-1">
			<Search
				class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
			/>
			<Input
				bind:value={qInput}
				type="search"
				placeholder={m.admin_users_search()}
				aria-label={m.admin_users_search()}
				class="pl-9"
			/>
		</div>
		<Select.Root type="single" value={access} onValueChange={changeAccessFilter}>
			<Select.Trigger class="w-full sm:w-56" aria-label={m.admin_users_col_access()}>
				<span>{accessOptions.find((o) => o.value === access)?.label}</span>
			</Select.Trigger>
			<Select.Content>
				{#each accessOptions as option (option.value)}
					<Select.Item value={option.value}>{option.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<div class="flex gap-2 2xl:hidden">
			<Select.Root type="single" value={sort} onValueChange={changeSort}>
				<Select.Trigger class="flex-1" aria-label={m.admin_users_sort_by()}>
					<span>{sortOptions.find((o) => o.value === sort)?.label}</span>
				</Select.Trigger>
				<Select.Content>
					{#each sortOptions as option (option.value)}
						<Select.Item value={option.value}>{option.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Button
				variant="outline"
				size="icon"
				aria-label={m.admin_users_sort_order()}
				onclick={flipOrder}
			>
				{#if order === 'asc'}
					<ArrowUp class="size-4" />
				{:else}
					<ArrowDown class="size-4" />
				{/if}
			</Button>
		</div>
	</div>

	{#if failed}
		<div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
			<CircleAlert class="size-4 text-destructive" />
			<span>{m.admin_load_failed()}</span>
			<Button variant="outline" size="sm" onclick={() => load({ q, access, sort, order, page })}>
				<RefreshCw class="size-4" />
				{m.admin_retry()}
			</Button>
		</div>
	{:else if loading && rows.length === 0}
		<div class="space-y-2">
			{#each [0, 1, 2, 3] as index (index)}
				<Skeleton class="h-16 w-full" />
			{/each}
		</div>
	{:else if rows.length === 0}
		<p class="text-muted-foreground py-8 text-center text-sm">{m.admin_users_empty()}</p>
	{:else}
		<div class="grid gap-3 transition-opacity md:grid-cols-2 2xl:hidden" class:opacity-60={loading}>
			{#each rows as row (row.id)}
				<div class="space-y-3 rounded-xl border p-3" data-testid="admin-user-card">
					<div class="flex items-center justify-between gap-3">
						{@render userCell(row)}
						{@render accessSwitch(row)}
					</div>
					{@render providerBadges(row)}
					<dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
						<div>
							<dt class="text-muted-foreground text-xs">{m.admin_users_col_created()}</dt>
							<dd>{row.createdAt ? formatDate(row.createdAt) : m.admin_users_never()}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground text-xs">{m.admin_users_col_last_active()}</dt>
							<dd>{row.lastActiveAt ? formatDate(row.lastActiveAt) : m.admin_users_never()}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground text-xs">{m.admin_users_col_entries()}</dt>
							<dd class="tabular-nums">{row.entryCount}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground text-xs">{m.admin_users_col_open_tasks()}</dt>
							<dd class="tabular-nums">{row.openAiTaskCount}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground text-xs">{m.admin_users_col_spend()}</dt>
							<dd>{@render spend(row)}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground text-xs">{m.admin_users_col_budget()}</dt>
							<dd>{@render budgetField(row)}</dd>
						</div>
					</dl>
				</div>
			{/each}
		</div>

		<div class="hidden rounded-xl border 2xl:block" class:opacity-60={loading}>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{@render sortHeader('name', m.admin_users_col_user())}</Table.Head>
						<Table.Head>{@render sortHeader('createdAt', m.admin_users_col_created())}</Table.Head>
						<Table.Head>
							{@render sortHeader('lastActiveAt', m.admin_users_col_last_active())}
						</Table.Head>
						<Table.Head class="text-right">
							{@render sortHeader('entryCount', m.admin_users_col_entries(), 'right')}
						</Table.Head>
						<Table.Head class="text-right">{m.admin_users_col_open_tasks()}</Table.Head>
						<Table.Head>{m.admin_users_col_access()}</Table.Head>
						<Table.Head class="text-right">
							{@render sortHeader('monthSpendUsd', m.admin_users_col_spend(), 'right')}
						</Table.Head>
						<Table.Head class="text-right">{m.admin_users_col_budget()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as row (row.id)}
						<Table.Row data-testid="admin-user-row">
							<Table.Cell class="max-w-72">
								<div class="space-y-1.5">
									{@render userCell(row)}
									{@render providerBadges(row)}
								</div>
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								{row.createdAt ? formatDate(row.createdAt) : m.admin_users_never()}
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								{row.lastActiveAt ? formatDate(row.lastActiveAt) : m.admin_users_never()}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{row.entryCount}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{row.openAiTaskCount}</Table.Cell>
							<Table.Cell>{@render accessSwitch(row)}</Table.Cell>
							<Table.Cell class="text-right">{@render spend(row)}</Table.Cell>
							<Table.Cell class="text-right">
								<div class="flex justify-end">{@render budgetField(row)}</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<ListPagination count={total} perPage={PER_PAGE} bind:page />
	{/if}
</section>
