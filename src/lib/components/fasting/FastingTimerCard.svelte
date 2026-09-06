<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import FastingRing from './FastingRing.svelte';
	import CheckCircle from '@lucide/svelte/icons/check-circle-2';
	import Play from '@lucide/svelte/icons/play';
	import Square from '@lucide/svelte/icons/square';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';
	import { formatTime } from '$lib/utils/dates';
	import {
		CUSTOM_HOURS_MAX,
		CUSTOM_HOURS_MIN,
		FASTING_PROTOCOLS,
		RUNNING_TARGET_OPTIONS,
		formatClock,
		formatDuration,
		fastProgress,
		fromDateTimeInput,
		toDateTimeInput,
		type FastingProtocolId
	} from '$lib/utils/fasting';
	import {
		adjustStart,
		changeTarget,
		discardFast,
		endFast,
		getRunningFast,
		loadRunningFast,
		startFast
	} from '$lib/stores/fasting-timer.svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		onCompleted: (session: {
			id: string;
			startedAt: string;
			endedAt: string;
			targetHours: number;
		}) => Promise<void> | void;
	};

	let { onCompleted }: Props = $props();

	let now = $state(Date.now());
	let running = $state(loadRunningFast());

	let protocol = $state<FastingProtocolId>('16:8');
	let customHours = $state(16);
	let startOverride = $state<string | null>(null);
	let adjusting = $state(false);
	let adjustValue = $state('');
	let confirmEnd = $state(false);
	let confirmDiscard = $state(false);

	const targetHours = $derived(
		FASTING_PROTOCOLS.find((p) => p.id === protocol)?.targetHours ?? customHours
	);
	const eatingHours = $derived(Math.max(0, 24 - targetHours));

	$effect(() => {
		running = loadRunningFast();
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	const progress = $derived(
		running ? fastProgress(Date.parse(running.startedAt), now, running.targetHours) : null
	);
	const targetEnd = $derived(
		running ? Date.parse(running.startedAt) + running.targetHours * 3_600_000 : 0
	);

	const start = () => {
		const startedAtMs = startOverride
			? (fromDateTimeInput(startOverride) ?? Date.now())
			: Date.now();
		startFast(targetHours, startedAtMs);
		running = getRunningFast();
		startOverride = null;
	};

	const openAdjust = () => {
		if (!running) return;
		adjustValue = toDateTimeInput(Date.parse(running.startedAt));
		adjusting = true;
	};

	const applyAdjust = () => {
		const ms = fromDateTimeInput(adjustValue);
		if (ms !== null) adjustStart(ms);
		running = getRunningFast();
		adjusting = false;
	};

	const setTarget = (hours: number) => {
		changeTarget(hours);
		running = getRunningFast();
	};

	const end = async () => {
		const session = endFast();
		running = null;
		confirmEnd = false;
		if (session) await onCompleted(session);
	};

	const discard = () => {
		discardFast();
		running = null;
		confirmDiscard = false;
	};
</script>

<Card.Root>
	<Card.Content class="pt-6">
		{#if running && progress}
			<div class="flex flex-col items-center gap-4">
				<div class="relative flex items-center justify-center">
					<FastingRing progress={progress.progress} />
					<div class="absolute flex flex-col items-center gap-1 text-center">
						{#if progress.reached}
							<CheckCircle class="size-6 text-green-600 dark:text-green-500" />
							<span class="text-sm font-medium text-green-600 dark:text-green-500">
								{m.fasting_target_reached()}
							</span>
						{/if}
						<span class="text-4xl font-semibold tabular-nums">
							{formatClock(progress.elapsedMs)}
						</span>
						<span class="text-muted-foreground text-sm">
							{m.fasting_of_target({ hours: running.targetHours })}
						</span>
						{#if !progress.reached}
							<span class="text-muted-foreground text-xs">
								{m.fasting_remaining_label({ duration: formatDuration(progress.remainingMs) })}
							</span>
						{/if}
					</div>
				</div>

				<div class="text-muted-foreground flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
					<span>{m.fasting_started_label({ time: formatTime(running.startedAt) })}</span>
					<span
						>{m.fasting_ends_label({ time: formatTime(new Date(targetEnd).toISOString()) })}</span
					>
				</div>

				<div class="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
					<Button variant="outline" size="sm" onclick={openAdjust}>
						{m.fasting_adjust_start()}
					</Button>
					<div class="flex items-center justify-center gap-2">
						<Label class="text-muted-foreground text-xs" for="fasting-target">
							{m.fasting_change_target()}
						</Label>
						<NativeSelect
							id="fasting-target"
							value={String(running.targetHours)}
							onchange={(e) => setTarget(Number(e.currentTarget.value))}
						>
							{#each [...new Set( [...RUNNING_TARGET_OPTIONS, running.targetHours] )].sort((a, b) => a - b) as hours (hours)}
								<NativeSelectOption value={String(hours)}>
									{m.fasting_hours_short({ hours })}
								</NativeSelectOption>
							{/each}
						</NativeSelect>
					</div>
				</div>

				<div class="flex w-full flex-col gap-2 sm:max-w-xs">
					<Button onclick={() => (confirmEnd = true)}>
						<Square class="mr-1.5 size-4" />
						{m.fasting_end()}
					</Button>
					<Button variant="ghost" size="sm" onclick={() => (confirmDiscard = true)}>
						<Trash2 class="mr-1.5 size-4" />
						{m.fasting_discard()}
					</Button>
				</div>
				<p class="text-muted-foreground text-center text-xs">{m.fasting_running_local_hint()}</p>
			</div>
		{:else}
			<div class="space-y-4">
				<div class="space-y-2">
					<Label class="text-sm font-medium">{m.fasting_protocol()}</Label>
					<div class="flex flex-wrap gap-2">
						{#each FASTING_PROTOCOLS as option (option.id)}
							<Button
								variant={protocol === option.id ? 'default' : 'outline'}
								size="sm"
								onclick={() => (protocol = option.id)}
							>
								{option.id === 'custom' ? m.fasting_protocol_custom() : option.label}
							</Button>
						{/each}
					</div>
					{#if protocol === 'custom'}
						<div class="flex items-center gap-2 pt-1">
							<Label class="text-muted-foreground text-xs" for="fasting-custom-hours">
								{m.fasting_custom_hours()}
							</Label>
							<NativeSelect
								id="fasting-custom-hours"
								value={String(customHours)}
								onchange={(e) => (customHours = Number(e.currentTarget.value))}
							>
								{#each Array.from({ length: CUSTOM_HOURS_MAX - CUSTOM_HOURS_MIN + 1 }, (_, i) => i + CUSTOM_HOURS_MIN) as hours (hours)}
									<NativeSelectOption value={String(hours)}>
										{m.fasting_hours_short({ hours })}
									</NativeSelectOption>
								{/each}
							</NativeSelect>
						</div>
					{/if}
					<p class="text-muted-foreground text-xs">
						{#if protocol === 'custom'}
							{m.fasting_protocol_description_custom({ hours: targetHours })}
						{:else}
							{m.fasting_protocol_description({ fasting: targetHours, eating: eatingHours })}
						{/if}
					</p>
				</div>

				<div class="space-y-2">
					<Label class="text-sm font-medium" for="fasting-start-time">
						{m.fasting_start_time()}
					</Label>
					{#if startOverride === null}
						<div class="flex items-center gap-2">
							<span class="text-muted-foreground text-sm">{m.fasting_start_now()}</span>
							<Button
								variant="outline"
								size="sm"
								onclick={() => (startOverride = toDateTimeInput(Date.now()))}
							>
								{m.fasting_adjust_start()}
							</Button>
						</div>
					{:else}
						<div class="flex items-center gap-2">
							<Input
								id="fasting-start-time"
								type="datetime-local"
								max={toDateTimeInput(Date.now())}
								bind:value={startOverride}
							/>
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.fasting_start_reset()}
								onclick={() => (startOverride = null)}
							>
								<X class="size-4" />
							</Button>
						</div>
					{/if}
				</div>

				<Button class="w-full" onclick={start}>
					<Play class="mr-1.5 size-4" />
					{m.fasting_start()}
				</Button>
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<AlertDialog.Root bind:open={adjusting}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.fasting_adjust_start()}</AlertDialog.Title>
		</AlertDialog.Header>
		<Input type="datetime-local" max={toDateTimeInput(now)} bind:value={adjustValue} />
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={applyAdjust}>{m.fasting_save()}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={confirmEnd}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.fasting_end_confirm_title()}</AlertDialog.Title>
			<AlertDialog.Description>{m.fasting_end_confirm_description()}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={end}>{m.fasting_end()}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={confirmDiscard}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.fasting_discard_confirm_title()}</AlertDialog.Title>
			<AlertDialog.Description>{m.fasting_discard_confirm_description()}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action
				class="bg-destructive text-white hover:bg-destructive/90"
				onclick={discard}
			>
				{m.fasting_discard()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
