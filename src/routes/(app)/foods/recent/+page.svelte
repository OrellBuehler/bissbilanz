<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Plus from '@lucide/svelte/icons/plus';
	import { api } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import type { components } from '$lib/api/generated/schema';
	import { entryService } from '$lib/services/entry-service.svelte';
	import { getCurrentMealByTime } from '$lib/utils/meals';
	import { formatDateLabel, today } from '$lib/utils/dates';
	import { formatKcal } from '$lib/utils/number';
	import { MACRO_TEXT_CLASS } from '$lib/utils/colors';

	type RecentFood = components['schemas']['FoodRecent'];

	let foods = $state<RecentFood[]>([]);
	let loading = $state(true);
	let loggingId = $state<string | null>(null);

	async function refresh() {
		loading = true;
		try {
			const { data } = await api.GET('/api/foods/recent');
			foods = data?.foods ?? [];
		} catch {
			foods = [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser) refresh();
	});

	// The same one-tap logging the favorites grid does: today, the meal the
	// clock says, and the amount the food was last logged with.
	async function logAgain(food: RecentFood) {
		loggingId = food.id;
		const meal = getCurrentMealByTime();
		try {
			await entryService.create({
				foodId: food.id,
				mealType: meal,
				servings: food.lastServings || 1,
				date: today()
			});
			toast.success(m.foods_recent_logged_toast({ name: food.name, meal }));
		} catch {
			toast.error(m.foods_recent_log_failed());
		} finally {
			loggingId = null;
		}
	}

	const lastLoggedLabel = (iso: string | null) =>
		iso ? m.foods_recent_last_logged({ date: formatDateLabel(iso.slice(0, 10)) }) : '';
</script>

<div class="mx-auto max-w-2xl space-y-4 pb-4">
	<div class="flex items-center gap-2">
		<Button
			variant="ghost"
			size="icon"
			aria-label={m.foods_duplicates_back()}
			onclick={() => goto('/foods')}
		>
			<ArrowLeft class="size-4" />
		</Button>
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-lg font-semibold">{m.foods_recent_title()}</h1>
			<p class="text-xs text-muted-foreground">{m.foods_recent_description()}</p>
		</div>
	</div>

	{#if loading}
		<div class="space-y-2">
			<Skeleton class="h-16 w-full" />
			<Skeleton class="h-16 w-full" />
			<Skeleton class="h-16 w-full" />
		</div>
	{:else if foods.length === 0}
		<div class="rounded-md border bg-card p-8 text-center">
			<p class="text-sm text-muted-foreground">{m.foods_recent_empty()}</p>
		</div>
	{:else}
		<ul class="grid gap-2">
			{#each foods as food (food.id)}
				<li class="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3">
					<div
						class="flex min-w-14 flex-col items-center rounded-lg bg-blue-50 px-2 py-1.5 dark:bg-blue-950"
					>
						<span class="text-lg font-bold leading-tight {MACRO_TEXT_CLASS.calories}">
							{formatKcal(food.calories)}
						</span>
						<span
							class="text-[10px] font-medium uppercase tracking-wider text-blue-500/70 dark:text-blue-400/70"
						>
							{m.foods_kcal()}
						</span>
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate font-medium">{food.name}</p>
						{#if food.brand}
							<p class="truncate text-xs text-muted-foreground">{food.brand}</p>
						{/if}
						<p class="truncate text-xs text-muted-foreground">
							{lastLoggedLabel(food.lastUsedAt)}
							· {m.foods_recent_log_count({ count: food.logCount })}
						</p>
					</div>
					<Button
						size="sm"
						class="shrink-0"
						disabled={loggingId === food.id}
						aria-label={m.foods_recent_log_again()}
						onclick={() => logAgain(food)}
					>
						<Plus class="size-4 sm:mr-1" />
						<span class="hidden sm:inline">{m.foods_recent_log_again()}</span>
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
