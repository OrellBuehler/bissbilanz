<script lang="ts">
	import { onMount } from 'svelte';
	import { today, shiftDate, daysAgo } from '$lib/utils/dates';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { isSupplementDue } from '$lib/utils/supplements';
	import type { ScheduleType } from '$lib/supplement-units';
	import { round2 } from '$lib/utils/number';
	import { apiFetch } from '$lib/utils/api';
	import * as m from '$lib/paraglide/messages';

	type IngredientInfo = {
		name: string;
		dosage: number;
		dosageUnit: string;
	};

	type HistoryEntry = {
		log: {
			id: string;
			supplementId: string;
			userId: string;
			date: string;
			takenAt: string;
		};
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
		ingredients: IngredientInfo[];
	};

	type DayItem = {
		name: string;
		dosage: number;
		dosageUnit: string;
		ingredients: IngredientInfo[];
	};

	type DayAdherence = {
		date: string;
		taken: DayItem[];
		missed: DayItem[];
	};

	let from = $state(daysAgo(30));
	let to = $state(shiftDate(today(), 1));
	let history: HistoryEntry[] = $state([]);
	let allSupplements: Supplement[] = $state([]);
	let expandedItems = $state(new Set<string>());

	const toggleExpand = (key: string) => {
		const next = new Set(expandedItems);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		expandedItems = next;
	};

	const loadHistory = async () => {
		const [histRes, suppRes] = await Promise.all([
			apiFetch(`/api/supplements/history?from=${from}&to=${to}`),
			apiFetch('/api/supplements?all=true')
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
				isSupplementDue(
					s.scheduleType,
					s.scheduleDays,
					s.scheduleStartDate,
					new Date(dateStr + 'T00:00:00')
				)
			);
			if (due.length === 0) continue;

			const takenIds = logsByDate.get(dateStr) ?? new Set();
			const toItem = (s: Supplement): DayItem => ({
				name: s.name,
				dosage: s.dosage,
				dosageUnit: s.dosageUnit,
				ingredients: s.ingredients ?? []
			});
			days.push({
				date: dateStr,
				taken: due.filter((s) => takenIds.has(s.id)).map(toItem),
				missed: due.filter((s) => !takenIds.has(s.id)).map(toItem)
			});
		}

		return days;
	});

	onMount(loadHistory);
</script>

<div class="mx-auto max-w-2xl space-y-4 pb-4">
	<div class="rounded-lg border bg-card p-3 sm:p-4">
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div class="space-y-1">
				<Label for="from">{m.supplements_history_from()}</Label>
				<Input id="from" type="date" bind:value={from} class="w-full min-w-0" />
			</div>
			<div class="space-y-1">
				<Label for="to">{m.supplements_history_to()}</Label>
				<Input id="to" type="date" bind:value={to} class="w-full min-w-0" />
			</div>
		</div>
		<div class="mt-3 flex">
			<Button class="w-full sm:w-auto" onclick={loadHistory}>
				{m.supplements_history_filter()}
			</Button>
		</div>
	</div>

	{#if adherenceByDay.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">
			{m.supplements_history_empty()}
		</p>
	{:else}
		<div class="space-y-3">
			{#each adherenceByDay as day (day.date)}
				<Card.Root>
					<Card.Header
						class="flex flex-col items-start justify-between gap-1 pb-2 sm:flex-row sm:items-center"
					>
						<Card.Title class="text-sm font-medium">{day.date}</Card.Title>
						<span class="text-xs text-muted-foreground">
							{m.supplements_history_adherence({
								taken: String(day.taken.length),
								total: String(day.taken.length + day.missed.length)
							})}
						</span>
					</Card.Header>
					<Card.Content>
						<div class="space-y-1">
							{#each day.taken as item}
								{@const itemKey = `${day.date}-taken-${item.name}`}
								<div>
									<button
										type="button"
										class="flex w-full min-w-0 items-start gap-2 rounded px-1 py-1 text-left text-sm hover:bg-muted/50 {item
											.ingredients.length > 0
											? 'cursor-pointer'
											: 'cursor-default'}"
										aria-expanded={expandedItems.has(itemKey)}
										onclick={() => item.ingredients.length > 0 && toggleExpand(itemKey)}
									>
										<Check class="size-4 text-green-500 shrink-0" />
										{#if item.ingredients.length > 0}
											{#if expandedItems.has(itemKey)}
												<ChevronDown class="size-3 shrink-0" />
											{:else}
												<ChevronRight class="size-3 shrink-0" />
											{/if}
										{/if}
										<span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
											<span class="min-w-0 wrap-break-word">{item.name}</span>
											<span class="text-muted-foreground"
												>{round2(item.dosage)} {item.dosageUnit}</span
											>
										</span>
									</button>
									{#if item.ingredients.length > 0 && expandedItems.has(itemKey)}
										<div class="ml-10 mt-1 mb-1 space-y-0.5">
											{#each item.ingredients as ing}
												<div class="wrap-break-word text-xs text-muted-foreground">
													{ing.name} — {round2(ing.dosage)}
													{ing.dosageUnit}
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
							{#each day.missed as item}
								{@const itemKey = `${day.date}-missed-${item.name}`}
								<div>
									<button
										type="button"
										class="flex w-full min-w-0 items-start gap-2 rounded px-1 py-1 text-left text-sm hover:bg-muted/50 {item
											.ingredients.length > 0
											? 'cursor-pointer'
											: 'cursor-default'}"
										aria-expanded={expandedItems.has(itemKey)}
										onclick={() => item.ingredients.length > 0 && toggleExpand(itemKey)}
									>
										<X class="size-4 text-red-500 shrink-0" />
										{#if item.ingredients.length > 0}
											{#if expandedItems.has(itemKey)}
												<ChevronDown class="size-3 shrink-0" />
											{:else}
												<ChevronRight class="size-3 shrink-0" />
											{/if}
										{/if}
										<span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
											<span class="min-w-0 wrap-break-word text-muted-foreground">{item.name}</span>
											<span class="text-muted-foreground"
												>{round2(item.dosage)} {item.dosageUnit}</span
											>
										</span>
									</button>
									{#if item.ingredients.length > 0 && expandedItems.has(itemKey)}
										<div class="ml-10 mt-1 mb-1 space-y-0.5">
											{#each item.ingredients as ing}
												<div class="wrap-break-word text-xs text-muted-foreground">
													{ing.name} — {round2(ing.dosage)}
													{ing.dosageUnit}
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
