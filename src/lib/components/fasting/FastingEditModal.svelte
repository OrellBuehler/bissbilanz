<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import {
		RUNNING_TARGET_OPTIONS,
		formatDuration,
		fromDateTimeInput,
		toDateTimeInput,
		type CompletedFast
	} from '$lib/utils/fasting';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open: boolean;
		fast: CompletedFast | null;
		onSave: (
			id: string,
			patch: { startedAt: string; endedAt: string; targetHours: number }
		) => Promise<void> | void;
		onDelete: (id: string) => Promise<void> | void;
	};

	let { open = $bindable(false), fast, onSave, onDelete }: Props = $props();

	let startValue = $state('');
	let endValue = $state('');
	let targetHours = $state(16);

	let loadedId: string | null = null;
	$effect(() => {
		if (!fast || fast.id === loadedId) return;
		loadedId = fast.id;
		startValue = toDateTimeInput(Date.parse(fast.startedAt));
		endValue = toDateTimeInput(Date.parse(fast.endedAt));
		targetHours = fast.targetHours;
	});

	const startMs = $derived(fromDateTimeInput(startValue));
	const endMs = $derived(fromDateTimeInput(endValue));
	const valid = $derived(startMs !== null && endMs !== null && endMs > startMs);

	const targetOptions = $derived(
		[...new Set([...RUNNING_TARGET_OPTIONS, targetHours])].sort((a, b) => a - b)
	);

	const save = async () => {
		if (!fast || !valid || startMs === null || endMs === null) return;
		await onSave(fast.id, {
			startedAt: new Date(startMs).toISOString(),
			endedAt: new Date(endMs).toISOString(),
			targetHours
		});
		open = false;
	};

	const remove = async () => {
		if (!fast) return;
		await onDelete(fast.id);
		open = false;
	};
</script>

<ResponsiveModal bind:open title={m.fasting_edit_title()}>
	{#snippet children()}
		<div class="space-y-4 px-4 pb-4 md:px-0">
			<div class="space-y-2">
				<Label for="fasting-edit-start">{m.fasting_field_start()}</Label>
				<Input id="fasting-edit-start" type="datetime-local" bind:value={startValue} />
			</div>
			<div class="space-y-2">
				<Label for="fasting-edit-end">{m.fasting_field_end()}</Label>
				<Input id="fasting-edit-end" type="datetime-local" bind:value={endValue} />
			</div>
			<div class="space-y-2">
				<Label for="fasting-edit-target">{m.fasting_field_target()}</Label>
				<NativeSelect
					id="fasting-edit-target"
					value={String(targetHours)}
					onchange={(e) => (targetHours = Number(e.currentTarget.value))}
				>
					{#each targetOptions as hours (hours)}
						<NativeSelectOption value={String(hours)}>
							{m.fasting_hours_short({ hours })}
						</NativeSelectOption>
					{/each}
				</NativeSelect>
			</div>

			{#if valid && startMs !== null && endMs !== null}
				<p class="text-muted-foreground text-sm">{formatDuration(endMs - startMs)}</p>
			{:else}
				<p class="text-destructive text-sm">{m.fasting_invalid_range()}</p>
			{/if}

			<div class="flex items-center justify-between gap-2 pt-2">
				<DeleteButton
					onDelete={remove}
					title={m.fasting_delete_title()}
					description={m.fasting_delete_description()}
				/>
				<div class="flex gap-2">
					<Button variant="outline" onclick={() => (open = false)}>{m.cancel()}</Button>
					<Button disabled={!valid} onclick={save}>{m.fasting_save()}</Button>
				</div>
			</div>
		</div>
	{/snippet}
</ResponsiveModal>
