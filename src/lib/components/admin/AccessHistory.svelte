<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import type { AdminUserDetail } from './admin-api';
	import { formatDateTime, formatUsd } from './format';

	type Entry = AdminUserDetail['auditLog'][number];

	let { entries, defaultBudget }: { entries: Entry[]; defaultBudget: number | null } = $props();

	const actionLabels: Record<string, () => string> = {
		'claude_access.grant': () => m.admin_audit_claude_access_grant(),
		'claude_access.revoke': () => m.admin_audit_claude_access_revoke(),
		'claude_access.update': () => m.admin_audit_claude_access_update(),
		'admin.grant': () => m.admin_audit_admin_grant(),
		'admin.revoke': () => m.admin_audit_admin_revoke(),
		'settings.claude_enabled': () => m.admin_audit_settings_claude_enabled()
	};

	const budgetText = (value: unknown) =>
		typeof value === 'number'
			? formatUsd(value)
			: defaultBudget === null
				? '—'
				: m.admin_users_budget_default({ amount: formatUsd(defaultBudget) });

	function details(entry: Entry): string[] {
		const before = entry.before ?? {};
		const after = entry.after ?? {};
		const lines: string[] = [];
		if (!('monthlyBudgetUsd' in after)) return lines;
		if (before.monthlyBudgetUsd !== after.monthlyBudgetUsd) {
			lines.push(m.admin_audit_budget({ value: budgetText(after.monthlyBudgetUsd) }));
		}
		if (before.note !== after.note && typeof after.note === 'string' && after.note) {
			lines.push(m.admin_audit_note({ value: after.note }));
		}
		return lines;
	}
</script>

{#if entries.length === 0}
	<p class="text-muted-foreground py-6 text-center text-sm">{m.admin_user_history_empty()}</p>
{:else}
	<ol class="divide-y rounded-xl border" data-testid="admin-audit-list">
		{#each entries as entry (entry.id)}
			<li class="space-y-0.5 px-3 py-2.5 text-sm">
				<div class="flex flex-wrap items-baseline justify-between gap-x-3">
					<span class="font-medium">{actionLabels[entry.action]?.() ?? entry.action}</span>
					<span class="text-muted-foreground text-xs">{formatDateTime(entry.createdAt)}</span>
				</div>
				<div class="text-muted-foreground text-xs">{entry.actorLabel}</div>
				{#each details(entry) as line (line)}
					<div class="text-xs">{line}</div>
				{/each}
			</li>
		{/each}
	</ol>
{/if}
