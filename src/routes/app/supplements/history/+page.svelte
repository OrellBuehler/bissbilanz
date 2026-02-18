<script lang="ts">
	import { onMount } from 'svelte';
	import { today, daysAgo } from '$lib/utils/dates';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Check from '@lucide/svelte/icons/check';
	import * as m from '$lib/paraglide/messages';

	type HistoryEntry = {
		log: { id: string; supplementId: string; userId: string; date: string; takenAt: string };
		supplementName: string;
		dosage: number;
		dosageUnit: string;
	};

	let from = $state(daysAgo(30));
	let to = $state(today());
	let history: HistoryEntry[] = $state([]);

	const loadHistory = async () => {
		const res = await fetch(`/api/supplements/history?from=${from}&to=${to}`);
		if (res.ok) {
			history = (await res.json()).history;
		}
	};

	// Group logs by date
	const grouped = $derived.by(() => {
		const map = new Map<string, HistoryEntry[]>();
		for (const entry of history) {
			const date = entry.log.date;
			if (!map.has(date)) map.set(date, []);
			map.get(date)!.push(entry);
		}
		return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
	});

	onMount(loadHistory);
</script>

<div class="mx-auto max-w-2xl space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">{m.supplements_history_title()}</h1>
	</div>

	<div class="flex items-end gap-4">
		<div class="space-y-1">
			<Label for="from">{m.supplements_history_from()}</Label>
			<Input id="from" type="date" bind:value={from} />
		</div>
		<div class="space-y-1">
			<Label for="to">{m.supplements_history_to()}</Label>
			<Input id="to" type="date" bind:value={to} />
		</div>
		<Button onclick={loadHistory}>{m.supplements_history_filter()}</Button>
	</div>

	{#if grouped.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.supplements_history_empty()}</p>
	{:else}
		<div class="space-y-3">
			{#each grouped as [date, entries] (date)}
				<Card.Root>
					<Card.Header class="pb-2">
						<Card.Title class="text-sm font-medium">{date}</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="space-y-1">
							{#each entries as entry}
								<div class="flex items-center gap-2 text-sm">
									<Check class="size-4 text-green-500" />
									<span>{entry.supplementName}</span>
									<span class="text-muted-foreground">{entry.dosage} {entry.dosageUnit}</span>
								</div>
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
