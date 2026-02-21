<script lang="ts">
	import { onMount } from 'svelte';
	import { today, daysAgo } from '$lib/utils/dates';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import { isSupplementDue } from '$lib/utils/supplements';
	import type { ScheduleType } from '$lib/supplement-units';
	import * as m from '$lib/paraglide/messages';

	type HistoryEntry = {
		log: { id: string; supplementId: string; userId: string; date: string; takenAt: string };
		supplementName: string;
		dosage: number;
		dosageUnit: string;
	};

	type Supplement = {
		id: string;
		name: string;
		dosage: number;
		dosageUnit: string;
		scheduleType: ScheduleType;
		scheduleDays: number[] | null;
		scheduleStartDate: string | null;
		isActive: boolean;
	};

	type DayAdherence = {
		date: string;
		taken: { name: string; dosage: number; dosageUnit: string }[];
		missed: { name: string; dosage: number; dosageUnit: string }[];
	};

	let from = $state(daysAgo(30));
	let to = $state(today());
	let history: HistoryEntry[] = $state([]);
	let allSupplements: Supplement[] = $state([]);

	const loadHistory = async () => {
		const [histRes, suppRes] = await Promise.all([
			fetch(`/api/supplements/history?from=${from}&to=${to}`),
			fetch('/api/supplements?all=true')
		]);
		if (histRes.ok) {
			history = (await histRes.json()).history;
		}
		if (suppRes.ok) {
			allSupplements = (await suppRes.json()).supplements;
		}
	};

	const adherenceByDay = $derived.by(() => {
		const activeSupplements = allSupplements.filter((s) => s.isActive);
		if (activeSupplements.length === 0) return [];

		const logsByDate = new Map<string, Set<string>>();
		for (const entry of history) {
			const date = entry.log.date;
			if (!logsByDate.has(date)) logsByDate.set(date, new Set());
			logsByDate.get(date)!.add(entry.log.supplementId);
		}

		const days: DayAdherence[] = [];
		const fromDate = new Date(from + 'T00:00:00');
		const toDate = new Date(to + 'T00:00:00');

		for (let d = new Date(toDate); d >= fromDate; d.setDate(d.getDate() - 1)) {
			const dateStr = d.toISOString().slice(0, 10);
			const due = activeSupplements.filter((s) =>
				isSupplementDue(s.scheduleType, s.scheduleDays, s.scheduleStartDate, new Date(dateStr + 'T00:00:00'))
			);
			if (due.length === 0) continue;

			const takenIds = logsByDate.get(dateStr) ?? new Set();
			days.push({
				date: dateStr,
				taken: due.filter((s) => takenIds.has(s.id)).map((s) => ({ name: s.name, dosage: s.dosage, dosageUnit: s.dosageUnit })),
				missed: due.filter((s) => !takenIds.has(s.id)).map((s) => ({ name: s.name, dosage: s.dosage, dosageUnit: s.dosageUnit }))
			});
		}

		return days;
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

	{#if adherenceByDay.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.supplements_history_empty()}</p>
	{:else}
		<div class="space-y-3">
			{#each adherenceByDay as day (day.date)}
				<Card.Root>
					<Card.Header class="flex flex-row items-center justify-between pb-2">
						<Card.Title class="text-sm font-medium">{day.date}</Card.Title>
						<span class="text-xs text-muted-foreground">
							{m.supplements_history_adherence({ taken: String(day.taken.length), total: String(day.taken.length + day.missed.length) })}
						</span>
					</Card.Header>
					<Card.Content>
						<div class="space-y-1">
							{#each day.taken as item}
								<div class="flex items-center gap-2 text-sm">
									<Check class="size-4 text-green-500" />
									<span>{item.name}</span>
									<span class="text-muted-foreground">{item.dosage} {item.dosageUnit}</span>
								</div>
							{/each}
							{#each day.missed as item}
								<div class="flex items-center gap-2 text-sm">
									<X class="size-4 text-red-500" />
									<span class="text-muted-foreground">{item.name}</span>
									<span class="text-muted-foreground">{item.dosage} {item.dosageUnit}</span>
								</div>
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
