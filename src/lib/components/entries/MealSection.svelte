<script lang="ts">
	import { formatEntryLabel } from '$lib/utils/entries-ui';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
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
		onAdd?: () => void;
		onEdit?: (entry: { id: string; servings: number; mealType: string; foodName?: string }) => void;
	};

	let { title, entries = [], readonly = false, onAdd, onEdit }: Props = $props();

	const formatTime = (iso: string | null | undefined) => {
		if (!iso) return '';
		const d = new Date(iso);
		return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	};
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
		<Card.Title class="text-lg">{title}</Card.Title>
		{#if !readonly && onAdd}
			<Button variant="outline" size="sm" onclick={onAdd}>{m.meal_add_food()}</Button>
		{/if}
	</Card.Header>
	<Card.Content>
		<ul class="space-y-2">
			{#each entries as entry}
				<li class="flex items-center justify-between text-sm">
					{#if readonly}
						<div class="flex items-center gap-2">
							<span>{formatEntryLabel(entry.foodName ?? 'Unknown', entry.servings)}</span>
							{#if entry.createdAt}
								<span class="text-xs text-muted-foreground/60">{formatTime(entry.createdAt)}</span>
							{/if}
						</div>
					{:else}
						<div class="flex items-center gap-2">
							<Button
								variant="ghost"
								class="h-auto p-0 text-left hover:underline"
								onclick={() =>
									onEdit?.({
										id: entry.id,
										servings: entry.servings,
										mealType: entry.mealType,
										foodName: entry.foodName ?? undefined
									})}
							>
								{formatEntryLabel(entry.foodName ?? 'Unknown', entry.servings)}
							</Button>
							{#if entry.createdAt}
								<span class="text-xs text-muted-foreground/60">{formatTime(entry.createdAt)}</span>
							{/if}
						</div>
					{/if}
					<span class="text-muted-foreground"
						>{Math.round((entry.calories ?? 0) * entry.servings)} kcal</span
					>
				</li>
			{:else}
				<li class="text-sm text-muted-foreground">{m.meal_no_entries()}</li>
			{/each}
		</ul>
	</Card.Content>
</Card.Root>
