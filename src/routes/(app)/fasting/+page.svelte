<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import FastingTimerCard from '$lib/components/fasting/FastingTimerCard.svelte';
	import FastingEditModal from '$lib/components/fasting/FastingEditModal.svelte';
	import CheckCircle from '@lucide/svelte/icons/check-circle-2';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { fastingService, FASTING_PAGE_SIZE } from '$lib/services/fasting-service.svelte';
	import { dayPropertiesService } from '$lib/services/day-properties-service.svelte';
	import type { DexieFastingSession } from '$lib/db/types';
	import { formatTime } from '$lib/utils/dates';
	import {
		formatDuration,
		fastReachedTarget,
		localDateOf,
		summarizeFasts
	} from '$lib/utils/fasting';
	import { deviceTimeZone } from '$lib/analytics/local-time';
	import * as m from '$lib/paraglide/messages';

	const sessionsQuery = useLiveQuery(() => fastingService.sessions(), [] as DexieFastingSession[]);
	const fasts = $derived(sessionsQuery.value);

	let limit = $state(FASTING_PAGE_SIZE);
	let hasMore = $state(false);
	let loadingMore = $state(false);
	let editing = $state<DexieFastingSession | null>(null);
	let editOpen = $state(false);
	let now = $state(Date.now());

	const summary = $derived(summarizeFasts(fasts, now));

	onMount(async () => {
		({ hasMore } = await fastingService.refresh(limit));
	});

	const loadMore = async () => {
		loadingMore = true;
		limit += FASTING_PAGE_SIZE;
		({ hasMore } = await fastingService.refresh(limit));
		loadingMore = false;
	};

	const onCompleted = async (session: {
		id: string;
		startedAt: string;
		endedAt: string;
		targetHours: number;
	}) => {
		await fastingService.complete(session);
		// Same as the mobile apps: finishing a fast marks the end day as a fasting day.
		await dayPropertiesService.setFastingDay(
			localDateOf(Date.parse(session.endedAt), deviceTimeZone()),
			true
		);
		now = Date.now();
	};

	const openEdit = (fast: DexieFastingSession) => {
		editing = fast;
		editOpen = true;
	};

	const saveEdit = async (
		id: string,
		patch: { startedAt: string; endedAt: string; targetHours: number }
	) => {
		await fastingService.update(id, patch);
	};

	const deleteFast = async (id: string) => {
		await fastingService.delete(id);
	};

	const fastDate = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
</script>

<svelte:head>
	<title>{m.nav_fasting()} — {m.app_title()}</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-4">
	<p class="text-muted-foreground text-sm">{m.fasting_page_description()}</p>

	<FastingTimerCard {onCompleted} />

	{#if fasts.length > 0}
		<Card.Root>
			<Card.Content class="grid grid-cols-3 gap-2 py-4 text-center">
				<div>
					<p class="text-muted-foreground text-xs">{m.fasting_summary_this_week()}</p>
					<p class="text-lg font-semibold tabular-nums">{summary.thisWeek}</p>
				</div>
				<div>
					<p class="text-muted-foreground text-xs">{m.fasting_summary_average()}</p>
					<p class="text-lg font-semibold tabular-nums">
						{formatDuration(summary.averageMinutes * 60_000)}
					</p>
				</div>
				<div>
					<p class="text-muted-foreground text-xs">{m.fasting_summary_longest()}</p>
					<p class="text-lg font-semibold tabular-nums">
						{formatDuration(summary.longestMinutes * 60_000)}
					</p>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">{m.fasting_history_title()}</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if fasts.length === 0}
				<p class="text-muted-foreground px-1 py-2 text-sm">{m.fasting_history_empty()}</p>
			{:else}
				<ul class="divide-border divide-y">
					{#each fasts as fast (fast.id)}
						<li>
							<button
								type="button"
								class="hover:bg-muted/50 flex w-full items-center justify-between gap-3 rounded-md px-1 py-2.5 text-left transition-colors"
								onclick={() => openEdit(fast)}
							>
								<div class="min-w-0">
									<p class="text-sm font-medium">{fastDate(fast.startedAt)}</p>
									<p class="text-muted-foreground text-xs">
										{formatTime(fast.startedAt)} – {formatTime(fast.endedAt)} ·
										{m.fasting_target_hours({ hours: fast.targetHours })}
									</p>
								</div>
								<div class="flex shrink-0 items-center gap-2">
									<span class="text-sm font-semibold tabular-nums">
										{formatDuration(Date.parse(fast.endedAt) - Date.parse(fast.startedAt))}
									</span>
									{#if fastReachedTarget(fast)}
										<CheckCircle
											class="size-4 text-green-600 dark:text-green-500"
											aria-label={m.fasting_target_reached()}
										/>
									{:else}
										<span class="size-4"></span>
									{/if}
								</div>
							</button>
						</li>
					{/each}
				</ul>
				<p class="text-muted-foreground px-1 pt-3 text-xs">{m.fasting_history_hint()}</p>
				{#if hasMore}
					<div class="pt-3">
						<Button
							variant="outline"
							size="sm"
							class="w-full"
							disabled={loadingMore}
							onclick={loadMore}
						>
							{m.fasting_history_load_more()}
						</Button>
					</div>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<FastingEditModal bind:open={editOpen} fast={editing} onSave={saveEdit} onDelete={deleteFast} />
