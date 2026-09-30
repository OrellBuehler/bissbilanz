<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { dayPropertiesService } from '$lib/services/day-properties-service.svelte';
	import NotebookPen from '@lucide/svelte/icons/notebook-pen';
	import * as m from '$lib/paraglide/messages';

	let { date }: { date: string } = $props();

	const propsQuery = useLiveQuery(() => dayPropertiesService.watch(date), undefined);

	const stored = $derived(propsQuery.value ?? null);

	let notesDraft = $state('');
	let notesDirty = $state(false);

	// Server/mirror values are the source of truth; the draft only diverges while
	// the field is being edited, so a background refresh must not overwrite it.
	$effect(() => {
		const row = propsQuery.value ?? null;
		if (!notesDirty) notesDraft = row?.notes ?? '';
	});

	let notesTimer: ReturnType<typeof setTimeout> | null = null;

	const commitNotes = (targetDate: string = date) => {
		if (notesTimer) {
			clearTimeout(notesTimer);
			notesTimer = null;
		}
		const trimmed = notesDraft.trim();
		notesDirty = false;
		if (trimmed === (stored?.notes ?? '')) return;
		dayPropertiesService.update(targetDate, {
			notes: trimmed === '' ? null : trimmed.slice(0, 2000)
		});
	};

	const onNotesInput = () => {
		notesDirty = true;
		if (notesTimer) clearTimeout(notesTimer);
		const armedDate = date;
		notesTimer = setTimeout(() => commitNotes(armedDate), 1200);
	};

	$effect(() => {
		const armedDate = date;
		return () => {
			if (notesTimer) commitNotes(armedDate);
		};
	});
</script>

<DashboardCard title={m.day_notes_title()} Icon={NotebookPen} tone="neutral">
	<Label class="sr-only" for="day-notes-input">{m.day_notes_title()}</Label>
	<Textarea
		id="day-notes-input"
		rows={3}
		maxlength={2000}
		placeholder={m.day_notes_placeholder()}
		bind:value={notesDraft}
		oninput={onNotesInput}
		onblur={() => commitNotes()}
	/>
</DashboardCard>
