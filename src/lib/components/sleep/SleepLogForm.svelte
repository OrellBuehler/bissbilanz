<script lang="ts">
	import { today } from '$lib/utils/dates';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { sleepService } from '$lib/services/sleep-service.svelte';
	import { toast } from 'svelte-sonner';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import * as m from '$lib/paraglide/messages';

	let { onLogged }: { onLogged?: () => void } = $props();

	let hours = $state(7);
	let minutes = $state(30);
	let quality = $state(7);
	let entryDate = $state(today());
	let bedtime = $state('');
	let wakeTime = $state('');
	let wakeUps = $state('');
	let notes = $state('');
	let showDetails = $state(false);
	let saving = $state(false);

	const submit = async (e: Event) => {
		e.preventDefault();
		const h = Number(hours);
		const min = Number(minutes);
		const durationMinutes = h * 60 + min;
		if (durationMinutes <= 0 || durationMinutes > 24 * 60) return;
		if (!entryDate) return;

		const toIso = (timeStr: string) => (timeStr ? `${entryDate}T${timeStr}:00.000Z` : null);

		saving = true;
		try {
			await sleepService.create({
				durationMinutes,
				quality: quality,
				entryDate,
				bedtime: toIso(bedtime),
				wakeTime: toIso(wakeTime),
				wakeUps: wakeUps !== '' ? Number(wakeUps) : null,
				notes: notes || null
			});
			hours = 7;
			minutes = 30;
			quality = 7;
			entryDate = today();
			bedtime = '';
			wakeTime = '';
			wakeUps = '';
			notes = '';
			toast.success(m.sleep_log());
			onLogged?.();
		} catch {
			toast.error(m.error_generic());
		} finally {
			saving = false;
		}
	};
</script>

<form onsubmit={submit} class="space-y-4">
	<div class="grid gap-4 sm:grid-cols-2">
		<div>
			<label class="mb-1.5 block text-sm font-medium">{m.sleep_duration()}</label>
			<div class="flex items-center gap-2">
				<div class="relative flex-1">
					<Input type="number" min="0" max="23" bind:value={hours} class="pr-7" />
					<span
						class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs font-medium text-muted-foreground"
						>h</span
					>
				</div>
				<div class="relative flex-1">
					<Input type="number" min="0" max="59" bind:value={minutes} class="pr-8" />
					<span
						class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs font-medium text-muted-foreground"
						>m</span
					>
				</div>
			</div>
		</div>

		<div>
			<label class="mb-1.5 block text-sm font-medium">{m.sleep_date_label()}</label>
			<Input type="date" bind:value={entryDate} max={today()} required />
		</div>
	</div>

	<div>
		<div class="mb-2 flex items-center justify-between">
			<label class="text-sm font-medium">{m.sleep_quality()}</label>
			<span class="text-sm font-semibold tabular-nums" style="color: #a78bfa">{quality}/10</span>
		</div>
		<div class="flex items-center gap-3">
			<span class="shrink-0 text-xs text-muted-foreground">{m.sleep_quality_poor()}</span>
			<Slider
				type="single"
				value={quality}
				min={1}
				max={10}
				step={1}
				onValueChange={(v: number) => (quality = v)}
				class="flex-1 [&_[data-slot=slider-range]]:bg-[#a78bfa] [&_[data-slot=slider-thumb]]:border-[#a78bfa]"
			/>
			<span class="shrink-0 text-xs text-muted-foreground">{m.sleep_quality_great()}</span>
		</div>
	</div>

	<div>
		<button
			type="button"
			class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
			onclick={() => (showDetails = !showDetails)}
		>
			{#if showDetails}<ChevronUp class="size-3.5" />{:else}<ChevronDown class="size-3.5" />{/if}
			<span>{showDetails ? m.sleep_less_details() : m.sleep_more_details()}</span>
		</button>

		{#if showDetails}
			<div class="mt-3 grid gap-3 sm:grid-cols-2">
				<div>
					<label class="mb-1 block text-sm font-medium">{m.sleep_bedtime()}</label>
					<Input type="time" bind:value={bedtime} />
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium">{m.sleep_wake_time()}</label>
					<Input type="time" bind:value={wakeTime} />
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium">{m.sleep_wake_ups()}</label>
					<Input type="number" min="0" bind:value={wakeUps} />
				</div>
				<div class="sm:col-span-2">
					<label class="mb-1 block text-sm font-medium">{m.sleep_notes_label()}</label>
					<Textarea bind:value={notes} rows={2} />
				</div>
			</div>
		{/if}
	</div>

	<div class="flex justify-end">
		<Button
			type="submit"
			disabled={saving}
			size="sm"
			class="w-full sm:w-auto bg-[#a78bfa] hover:bg-[#8b5cf6] text-white border-transparent"
		>
			{saving ? '...' : m.sleep_save()}
		</Button>
	</div>
</form>
