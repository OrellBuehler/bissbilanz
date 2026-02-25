<script lang="ts">
	import { formatEntryLabel } from '$lib/utils/entries-ui';
	import { Button } from '$lib/components/ui/button/index.js';
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import Sunrise from '@lucide/svelte/icons/sunrise';
	import Sunset from '@lucide/svelte/icons/sunset';
	import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
	import SwipeableEntry from '$lib/components/entries/SwipeableEntry.svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		title: string;
		entries?: Array<{
			id: string;
			foodName?: string | null;
			calories: number | null;
			servings: number;
			mealType: string;
			createdAt?: string | null;
		}>;
		readonly?: boolean;
		dashboardStyle?: boolean;
		onAdd?: () => void;
		onEdit?: (entry: { id: string; servings: number; mealType: string; foodName?: string }) => void;
		onDelete?: (id: string) => void;
	};

	let {
		title,
		entries = [],
		readonly = false,
		dashboardStyle = false,
		onAdd,
		onEdit,
		onDelete
	}: Props = $props();

	const formatTime = (iso: string | null | undefined) => {
		if (!iso) return '';
		const d = new Date(iso);
		return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	};

	const mealVisual = $derived.by(() => {
		const key = title.trim().toLowerCase();
		if (key.includes('breakfast')) return { Icon: Sunrise, tone: 'amber' as const };
		if (key.includes('lunch')) return { Icon: Sun, tone: 'blue' as const };
		if (key.includes('dinner')) return { Icon: Sunset, tone: 'rose' as const };
		if (key.includes('snack')) return { Icon: Moon, tone: 'violet' as const };
		return { Icon: UtensilsCrossed, tone: 'neutral' as const };
	});
</script>

{#snippet mealList()}
	<ul class={dashboardStyle ? 'space-y-2' : 'space-y-2'}>
		{#each entries as entry}
			{#if !readonly}
				<SwipeableEntry onDelete={() => onDelete?.(entry.id)}>
					<li
						class={dashboardStyle
							? 'flex items-center justify-between rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm'
							: 'flex items-center justify-between text-sm'}
					>
						<div class="flex min-w-0 flex-1 items-center gap-2">
							<button
								type="button"
								class="min-w-0 truncate text-left text-sm font-medium hover:underline"
								onclick={() =>
									onEdit?.({
										id: entry.id,
										servings: entry.servings,
										mealType: entry.mealType,
										foodName: entry.foodName ?? undefined
									})}
							>
								{formatEntryLabel(entry.foodName ?? 'Unknown', entry.servings)}
							</button>
							{#if entry.createdAt}
								<span class="shrink-0 text-xs text-muted-foreground/60">{formatTime(entry.createdAt)}</span>
							{/if}
						</div>
						<span class="shrink-0 text-muted-foreground"
							>{Math.round((entry.calories ?? 0) * entry.servings)} kcal</span
						>
					</li>
				</SwipeableEntry>
			{:else}
				<li
					class={dashboardStyle
						? 'flex items-center justify-between rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm'
						: 'flex items-center justify-between text-sm'}
				>
					<div class="flex min-w-0 flex-1 items-center gap-2">
						<span class="truncate">{formatEntryLabel(entry.foodName ?? 'Unknown', entry.servings)}</span>
						{#if entry.createdAt}
							<span class="shrink-0 text-xs text-muted-foreground/60">{formatTime(entry.createdAt)}</span>
						{/if}
					</div>
					<span class="shrink-0 text-muted-foreground"
						>{Math.round((entry.calories ?? 0) * entry.servings)} kcal</span
					>
				</li>
			{/if}
		{:else}
			<li
				class={dashboardStyle
					? 'rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground'
					: 'text-sm text-muted-foreground'}
			>
				{m.meal_no_entries()}
			</li>
		{/each}
	</ul>
{/snippet}

{#if dashboardStyle}
	<DashboardCard {title} Icon={mealVisual.Icon} tone={mealVisual.tone}>
		{#snippet headerRight()}
			{#if !readonly && onAdd}
				<Button variant="outline" size="sm" onclick={onAdd}>{m.meal_add_food()}</Button>
			{/if}
		{/snippet}
		{@render mealList()}
	</DashboardCard>
{:else}
	<Card.Root>
		<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
			<Card.Title class="text-lg">{title}</Card.Title>
			{#if !readonly && onAdd}
				<Button variant="outline" size="sm" onclick={onAdd}>{m.meal_add_food()}</Button>
			{/if}
		</Card.Header>
		<Card.Content>
			{@render mealList()}
		</Card.Content>
	</Card.Root>
{/if}
