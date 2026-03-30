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
	import { formatTime } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		title: string;
		entries?: Array<{
			id: string;
			foodName?: string | null;
			calories: number | null;
			servings: number;
			mealType: string;
			eatenAt?: string | null;
			createdAt?: string | null;
			servingSize?: number | null;
			servingUnit?: string | null;
			quickCalories?: number | null;
			quickProtein?: number | null;
			quickCarbs?: number | null;
			quickFat?: number | null;
			quickFiber?: number | null;
			quickName?: string | null;
		}>;
		readonly?: boolean;
		dashboardStyle?: boolean;
		onAdd?: () => void;
		onEdit?: (entry: {
			id: string;
			servings: number;
			mealType: string;
			foodName?: string;
			servingSize?: number | null;
			servingUnit?: string | null;
			calories?: number | null;
			eatenAt?: string | null;
			quickCalories?: number | null;
			quickProtein?: number | null;
			quickCarbs?: number | null;
			quickFat?: number | null;
			quickFiber?: number | null;
			quickName?: string | null;
		}) => void;
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
				{@const handleEdit = () =>
					onEdit?.({
						id: entry.id,
						servings: entry.servings,
						mealType: entry.mealType,
						foodName: entry.foodName ?? undefined,
						servingSize: entry.servingSize,
						servingUnit: entry.servingUnit,
						calories: entry.calories,
						eatenAt: entry.eatenAt,
						quickCalories: entry.quickCalories,
						quickProtein: entry.quickProtein,
						quickCarbs: entry.quickCarbs,
						quickFat: entry.quickFat,
						quickFiber: entry.quickFiber,
						quickName: entry.quickName
					})}
				<SwipeableEntry onDelete={() => onDelete?.(entry.id)}>
					<div
						role="button"
						tabindex="0"
						class="{dashboardStyle
							? 'flex min-w-0 items-center justify-between overflow-hidden rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm'
							: 'flex min-w-0 items-center justify-between overflow-hidden text-sm'} cursor-pointer active:opacity-70"
						onclick={handleEdit}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								handleEdit();
							}
						}}
					>
						<div class="flex min-w-0 flex-1 items-center gap-2">
							<span class="min-w-0 truncate font-medium">
								{formatEntryLabel(
									entry.foodName ?? 'Unknown',
									entry.servings,
									entry.servingSize,
									entry.servingUnit
								)}
							</span>
							{#if entry.eatenAt || entry.createdAt}
								<span class="shrink-0 text-xs text-muted-foreground/60"
									>{formatTime(entry.eatenAt ?? entry.createdAt)}</span
								>
							{/if}
						</div>
						<span class="shrink-0 tabular-nums text-muted-foreground"
							>{Math.round((entry.calories ?? 0) * entry.servings)} kcal</span
						>
					</div>
				</SwipeableEntry>
			{:else}
				<li
					class={dashboardStyle
						? 'flex min-w-0 items-center justify-between overflow-hidden rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm'
						: 'flex min-w-0 items-center justify-between overflow-hidden text-sm'}
				>
					<div class="flex min-w-0 flex-1 items-center gap-2">
						<span class="truncate"
							>{formatEntryLabel(
								entry.foodName ?? 'Unknown',
								entry.servings,
								entry.servingSize,
								entry.servingUnit
							)}</span
						>
						{#if entry.eatenAt || entry.createdAt}
							<span class="shrink-0 text-xs text-muted-foreground/60"
								>{formatTime(entry.eatenAt ?? entry.createdAt)}</span
							>
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
					? 'rounded-xl border border-dashed border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground'
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
