<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Pill from '@lucide/svelte/icons/pill';
	import * as m from '$lib/paraglide/messages';

	type ChecklistItem = {
		supplement: {
			id: string;
			name: string;
			dosage: number;
			dosageUnit: string;
			timeOfDay: string | null;
			ingredients?: { name: string; dosage: number; dosageUnit: string }[];
		};
		taken: boolean;
		takenAt: string | null;
	};

	let {
		checklist = [],
		onToggle
	}: {
		checklist: ChecklistItem[];
		onToggle: (supplementId: string, taken: boolean) => void;
	} = $props();

	const takenCount = $derived(checklist.filter((c) => c.taken).length);

	const timeLabels: Record<string, () => string> = {
		morning: () => m.supplements_time_morning(),
		noon: () => m.supplements_time_noon(),
		evening: () => m.supplements_time_evening(),
		anytime: () => m.supplements_time_anytime()
	};

	const timeOrder: (string | null)[] = ['morning', 'noon', 'evening', null];

	const grouped = $derived.by(() => {
		const groups = new Map<string | null, ChecklistItem[]>();
		for (const item of checklist) {
			const key = item.supplement.timeOfDay ?? null;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(item);
		}
		return timeOrder
			.filter((t) => groups.has(t))
			.map((t) => ({ timeOfDay: t, items: groups.get(t)! }));
	});
</script>

<DashboardCard title={m.dashboard_supplements()} Icon={Pill} tone="emerald">
	{#snippet headerRight()}
		{#if checklist.length > 0}
			<span class="text-muted-foreground max-w-[11rem] text-right text-xs sm:text-sm">
				{#if takenCount === checklist.length}
					{m.dashboard_supplements_all_taken()}
				{:else}
					{m.dashboard_supplements_progress({
						taken: String(takenCount),
						total: String(checklist.length)
					})}
				{/if}
			</span>
		{/if}
	{/snippet}
	{#if checklist.length === 0}
		<p class="text-muted-foreground text-sm">{m.supplements_empty()}</p>
	{:else}
		<div class="space-y-2">
			{#each grouped as group}
				{#if grouped.length > 1}
					<p class="text-xs text-muted-foreground px-1 pt-2 font-medium first:pt-0">
						{timeLabels[group.timeOfDay ?? 'anytime']()}
					</p>
				{/if}
				{#each group.items as item (item.supplement.id)}
					<label
						class="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-transparent bg-background/60 p-2.5 transition-colors hover:border-emerald-200/60 hover:bg-background dark:hover:border-emerald-900/40"
					>
						<Checkbox
							checked={item.taken}
							onCheckedChange={(checked) => onToggle(item.supplement.id, !!checked)}
						/>
						<div class="min-w-0 flex-1">
							<div
								class={item.taken
									? 'text-muted-foreground line-through break-words'
									: 'break-words'}
							>
								{item.supplement.name}
							</div>
							<span class="text-muted-foreground mt-0.5 block text-xs sm:hidden">
								{item.supplement.dosage}
								{item.supplement.dosageUnit}
								{#if item.supplement.ingredients && item.supplement.ingredients.length > 0}
									<span class="text-xs"
										>({item.supplement.ingredients.length === 1
											? m.supplements_ingredient_count_one()
											: m.supplements_ingredient_count({
													count: String(item.supplement.ingredients.length)
												})})</span
									>
								{/if}
							</span>
						</div>
						<span class="text-muted-foreground ml-auto hidden text-sm sm:block">
							{item.supplement.dosage}
							{item.supplement.dosageUnit}
							{#if item.supplement.ingredients && item.supplement.ingredients.length > 0}
								<span class="text-xs"
									>({item.supplement.ingredients.length === 1
										? m.supplements_ingredient_count_one()
										: m.supplements_ingredient_count({
												count: String(item.supplement.ingredients.length)
											})})</span
								>
							{/if}
						</span>
					</label>
				{/each}
			{/each}
		</div>
	{/if}
	<Button variant="outline" size="sm" href="/supplements" class="mt-3 w-full">
		{m.supplements_title()}
	</Button>
</DashboardCard>
