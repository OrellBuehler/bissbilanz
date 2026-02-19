<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
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
		return timeOrder.filter((t) => groups.has(t)).map((t) => ({ timeOfDay: t, items: groups.get(t)! }));
	});
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-center justify-between pb-2">
		<div class="flex items-center gap-2">
			<Pill class="h-5 w-5" />
			<Card.Title class="text-base">{m.dashboard_supplements()}</Card.Title>
		</div>
		{#if checklist.length > 0}
			<span class="text-muted-foreground text-sm">
				{#if takenCount === checklist.length}
					{m.dashboard_supplements_all_taken()}
				{:else}
					{m.dashboard_supplements_progress({ taken: String(takenCount), total: String(checklist.length) })}
				{/if}
			</span>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if checklist.length === 0}
			<p class="text-muted-foreground text-sm">{m.supplements_empty()}</p>
		{:else}
			<div class="space-y-2">
				{#each grouped as group}
					{#if grouped.length > 1}
						<p class="text-xs text-muted-foreground font-medium pt-2 first:pt-0">
							{timeLabels[group.timeOfDay ?? 'anytime']()}
						</p>
					{/if}
					{#each group.items as item (item.supplement.id)}
						<label
							class="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50"
						>
							<Checkbox
								checked={item.taken}
								onCheckedChange={(checked) => onToggle(item.supplement.id, !!checked)}
							/>
							<span class={item.taken ? 'text-muted-foreground line-through' : ''}>
								{item.supplement.name}
							</span>
							<span class="text-muted-foreground ml-auto text-sm">
								{item.supplement.dosage} {item.supplement.dosageUnit}
							</span>
						</label>
					{/each}
				{/each}
			</div>
		{/if}
		<div class="mt-3 border-t pt-3">
			<Button variant="ghost" size="sm" href="/app/supplements" class="w-full">
				{m.supplements_title()}
			</Button>
		</div>
	</Card.Content>
</Card.Root>
