<script lang="ts">
	import ClaudeOverviewCard from '$lib/components/admin/ClaudeOverviewCard.svelte';
	import UserTable from '$lib/components/admin/UserTable.svelte';
	import * as m from '$lib/paraglide/messages';

	let defaultBudget = $state<number | null>(null);
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<h1 class="sr-only">{m.admin_title()}</h1>
	<ClaudeOverviewCard onLoad={(overview) => (defaultBudget = overview.defaultUserBudgetUsd)} />
	<UserTable {defaultBudget} />
</div>
