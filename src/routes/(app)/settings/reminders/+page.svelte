<script lang="ts">
	import { onMount } from 'svelte';
	import ReminderForm, {
		type ReminderPayload
	} from '$lib/components/reminders/ReminderForm.svelte';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Scale from '@lucide/svelte/icons/scale';
	import Utensils from '@lucide/svelte/icons/utensils';
	import Moon from '@lucide/svelte/icons/moon';
	import BellRing from '@lucide/svelte/icons/bell-ring';
	import { reminderService } from '$lib/services/reminder-service.svelte';
	import { supplementService } from '$lib/services/supplement-service.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import type { DexieReminder, DexieSupplement } from '$lib/db/types';
	import PushNotifications from '../PushNotifications.svelte';
	import * as m from '$lib/paraglide/messages';

	const allReminders = useLiveQuery(() => reminderService.reminders(), [] as DexieReminder[]);
	const reminders = $derived(allReminders.value);

	const allSupplements = useLiveQuery(
		() => supplementService.supplements(true),
		[] as DexieSupplement[]
	);
	const supplementReminders = $derived(
		allSupplements.value.filter((s) => (s.reminderTimes?.length ?? 0) > 0)
	);

	let showForm = $state(false);
	let editingReminder: DexieReminder | null = $state(null);

	const kindIcons = { weight: Scale, meal: Utensils, sleep: Moon } as const;
	const kindLabels = {
		weight: () => m.reminders_kind_weight(),
		meal: () => m.reminders_kind_meal(),
		sleep: () => m.reminders_kind_sleep()
	} as const;

	const dayLabels = [
		m.supplements_day_sun,
		m.supplements_day_mon,
		m.supplements_day_tue,
		m.supplements_day_wed,
		m.supplements_day_thu,
		m.supplements_day_fri,
		m.supplements_day_sat
	];

	const formatWeekdays = (weekdays: number[]) =>
		weekdays.length === 7
			? m.reminders_every_day()
			: [...weekdays]
					.sort((a, b) => a - b)
					.map((d) => dayLabels[d]())
					.join(', ');

	const reminderSummary = (reminder: DexieReminder) => {
		const parts = [reminder.time, formatWeekdays(reminder.weekdays)];
		if (reminder.kind === 'meal' && reminder.mealType) parts.push(reminder.mealType);
		return parts.join(' · ');
	};

	const createReminder = async (payload: ReminderPayload) => {
		await reminderService.create(payload);
		showForm = false;
	};

	const updateReminder = async (payload: ReminderPayload) => {
		if (!editingReminder) return;
		await reminderService.update(editingReminder.id, payload);
		editingReminder = null;
		showForm = false;
	};

	const deleteReminder = async (id: string) => {
		await reminderService.delete(id);
	};

	const toggleEnabled = async (reminder: DexieReminder) => {
		await reminderService.update(reminder.id, { enabled: !reminder.enabled });
	};

	const openEdit = (reminder: DexieReminder) => {
		editingReminder = reminder;
		showForm = true;
	};

	const closeForm = () => {
		showForm = false;
		editingReminder = null;
	};

	onMount(() => {
		reminderService.refresh();
		supplementService.refresh();
	});
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<PushNotifications />

	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-lg font-semibold">{m.reminders_title()}</h2>
		<Button size="sm" onclick={() => (showForm = true)}>
			<Plus class="mr-1.5 size-4" />
			{m.reminders_add()}
		</Button>
	</div>

	{#if reminders.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.reminders_empty()}</p>
	{:else}
		<div class="space-y-3">
			{#each reminders as reminder (reminder.id)}
				{@const Icon = kindIcons[reminder.kind]}
				<Card.Root class={reminder.enabled ? '' : 'opacity-60'}>
					<Card.Content class="flex items-center gap-4 py-3">
						<Icon class="size-5 shrink-0 text-muted-foreground" />
						<div class="min-w-0 flex-1">
							<div class="font-medium">{kindLabels[reminder.kind]()}</div>
							<div class="text-sm text-muted-foreground">{reminderSummary(reminder)}</div>
						</div>
						<Switch checked={reminder.enabled} onCheckedChange={() => toggleEnabled(reminder)} />
						<Button variant="ghost" size="icon" onclick={() => openEdit(reminder)}>
							<Pencil class="size-4" />
						</Button>
						<DeleteButton
							onDelete={() => deleteReminder(reminder.id)}
							title={m.reminders_delete()}
							description={m.reminders_delete_confirm()}
						/>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<ResponsiveModal
	bind:open={showForm}
	title={editingReminder ? m.reminders_edit() : m.reminders_add()}
>
	<ReminderForm
		reminder={editingReminder}
		onSave={editingReminder ? updateReminder : createReminder}
		onCancel={closeForm}
	/>
</ResponsiveModal>

<div class="mx-auto max-w-2xl">
	<Card.Root class="mt-6">
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<BellRing class="size-4" />
				{m.reminders_supplements_title()}
			</Card.Title>
			<Card.Description>{m.reminders_supplements_desc()}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if supplementReminders.length === 0}
				<p class="text-sm text-muted-foreground">{m.reminders_supplements_empty()}</p>
			{:else}
				<div class="space-y-2">
					{#each supplementReminders as supplement (supplement.id)}
						<a
							href={`/supplements?edit=${supplement.id}`}
							class="flex items-center justify-between gap-2 rounded-md border p-3 text-sm hover:bg-muted/50"
						>
							<span class="font-medium">{supplement.name}</span>
							<span class="text-muted-foreground">{supplement.reminderTimes?.join(', ')}</span>
						</a>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
