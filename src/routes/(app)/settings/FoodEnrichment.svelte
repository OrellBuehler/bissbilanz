<script lang="ts">
	import { onMount } from 'svelte';
	import * as Sentry from '@sentry/sveltekit';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import CircleStop from '@lucide/svelte/icons/circle-stop';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import {
		FoodEnrichmentRequestError,
		foodService,
		type FoodEnrichmentStatus
	} from '$lib/services/food-service.svelte';
	import * as m from '$lib/paraglide/messages';

	const POLL_MS = 3000;
	const MAX_LOAD_FAILURES = 3;

	let status = $state<FoodEnrichmentStatus | null>(null);
	let busy = $state(false);
	let loadFailures = $state(0);
	let polling = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let destroyed = false;

	const isActive = (value: FoodEnrichmentStatus | null) =>
		value?.job?.state === 'queued' || value?.job?.state === 'running';

	const job = $derived(status?.job ?? null);
	const active = $derived(isActive(status));
	const stalled = $derived(loadFailures > 0 && !polling);
	const percent = $derived(
		job && job.total > 0 ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0
	);
	const finishedAt = $derived(
		job?.finishedAt
			? new Date(job.finishedAt).toLocaleString(undefined, {
					dateStyle: 'medium',
					timeStyle: 'short'
				})
			: ''
	);

	function report(error: unknown) {
		if (error instanceof FoodEnrichmentRequestError) {
			Sentry.addBreadcrumb({
				category: 'food-enrichment',
				level: 'warning',
				message: error.message,
				data: { status: error.status }
			});
			return;
		}
		Sentry.captureException(error, { extra: { context: 'settings.food-enrichment' } });
	}

	function schedule(delay: number) {
		clearTimeout(timer);
		polling = !destroyed && isActive(status) && loadFailures < MAX_LOAD_FAILURES;
		timer = polling ? setTimeout(() => void load(), delay) : undefined;
	}

	function apply(next: FoodEnrichmentStatus) {
		if (destroyed) return;
		const finished = isActive(status) && !isActive(next);
		status = next;
		loadFailures = 0;
		if (finished && (next.job?.updated ?? 0) > 0) foodService.refresh().catch(report);
		schedule(POLL_MS);
	}

	async function load() {
		try {
			apply(await foodService.enrichmentStatus());
		} catch (error) {
			if (destroyed) return;
			report(error);
			loadFailures += 1;
			schedule(POLL_MS * 2);
		}
	}

	function retry() {
		loadFailures = 0;
		void load();
	}

	async function run(action: () => Promise<FoodEnrichmentStatus>) {
		if (!navigator.onLine) {
			toast.error(m.quality_enrich_offline());
			return;
		}
		busy = true;
		try {
			apply(await action());
		} catch (error) {
			if (destroyed) return;
			report(error);
			toast.error(m.settings_enrich_foods_action_failed());
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		void load();
		return () => {
			destroyed = true;
			clearTimeout(timer);
		};
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.settings_enrich_foods_title()}</Card.Title>
		<Card.Description>{m.settings_enrich_foods_desc()}</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if stalled}
			<div class="flex items-center justify-between gap-3">
				<p class="text-destructive text-sm">{m.settings_enrich_foods_load_failed()}</p>
				<Button variant="outline" size="sm" onclick={retry}>
					<RotateCw class="size-4" />
					{m.settings_enrich_foods_retry()}
				</Button>
			</div>
		{/if}
		{#if !status}
			{#if !stalled}
				<div class="text-muted-foreground flex items-center gap-2 text-sm">
					<LoaderCircle class="size-4 animate-spin" />
					{m.settings_enrich_foods_loading()}
				</div>
			{/if}
		{:else if active && job}
			<div class="space-y-2">
				<div class="flex items-center justify-between gap-3 text-sm">
					<span class="flex min-w-0 items-center gap-2">
						<LoaderCircle class="size-4 shrink-0 animate-spin" />
						<span class="truncate">
							{job.state === 'queued'
								? m.settings_enrich_foods_queued()
								: m.settings_enrich_foods_progress({
										processed: String(job.processed),
										total: String(job.total)
									})}
						</span>
					</span>
					<span class="text-muted-foreground tabular-nums">{percent}%</span>
				</div>
				<Progress value={percent} aria-label={m.settings_enrich_foods_title()} />
				<p class="text-muted-foreground text-xs tabular-nums">
					{m.settings_enrich_foods_counts({
						updated: String(job.updated),
						notFound: String(job.notFound),
						failed: String(job.failed)
					})}
				</p>
				<p class="text-muted-foreground text-xs">{m.settings_enrich_foods_background()}</p>
			</div>
			<Button
				variant="outline"
				class="w-full sm:w-auto"
				disabled={busy}
				onclick={() => run(foodService.cancelEnrichment)}
			>
				<CircleStop class="size-4" />
				{m.settings_enrich_foods_stop()}
			</Button>
		{:else}
			<p class="text-sm">
				{status.candidates > 0
					? m.settings_enrich_foods_candidates({ count: String(status.candidates) })
					: m.settings_enrich_foods_none()}
			</p>
			{#if job}
				<div class="space-y-1 rounded-lg border border-border/60 p-3 text-sm">
					<p>
						{#if job.state === 'cancelled'}
							{m.settings_enrich_foods_last_cancelled({
								date: finishedAt,
								processed: String(job.processed),
								total: String(job.total)
							})}
						{:else if job.state === 'failed'}
							{m.settings_enrich_foods_last_failed({
								date: finishedAt,
								processed: String(job.processed),
								total: String(job.total)
							})}
						{:else}
							{m.settings_enrich_foods_last_completed({
								date: finishedAt,
								processed: String(job.processed)
							})}
						{/if}
					</p>
					<p class="text-muted-foreground text-xs tabular-nums">
						{m.settings_enrich_foods_counts({
							updated: String(job.updated),
							notFound: String(job.notFound),
							failed: String(job.failed)
						})}
					</p>
				</div>
			{/if}
			<Button
				class="w-full sm:w-auto"
				disabled={busy || status.candidates === 0}
				onclick={() => run(foodService.startEnrichment)}
			>
				{#if busy}
					<LoaderCircle class="size-4 animate-spin" />
				{:else}
					<Sparkles class="size-4" />
				{/if}
				{m.settings_enrich_foods_start()}
			</Button>
		{/if}
	</Card.Content>
</Card.Root>
