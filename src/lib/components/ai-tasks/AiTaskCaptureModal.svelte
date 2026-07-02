<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import Camera from '@lucide/svelte/icons/camera';
	import X from '@lucide/svelte/icons/x';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Send from '@lucide/svelte/icons/send';
	import { today } from '$lib/utils/dates';
	import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
	import { mealTypeService } from '$lib/services/meal-type-service.svelte';
	import { aiTaskService } from '$lib/services/ai-task-service.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import type { DexieCustomMealType } from '$lib/db/types';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open?: boolean;
		onClose?: () => void;
		onCreated?: () => void;
	};

	let { open = $bindable(false), onClose, onCreated }: Props = $props();

	const NO_MEAL = '__none__';
	const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

	const customMealTypesQuery = useLiveQuery(
		() => mealTypeService.mealTypes(),
		[] as DexieCustomMealType[]
	);
	const mealOptions = $derived([
		...DEFAULT_MEAL_TYPES,
		...customMealTypesQuery.value.map((mt) => mt.name)
	]);

	let description = $state('');
	let date = $state(today());
	let mealType = $state(NO_MEAL);
	let photoFile: File | null = $state(null);
	let photoPreviewUrl: string | null = $state(null);
	let saving = $state(false);
	let fileInputEl: HTMLInputElement | null = $state(null);

	const canSubmit = $derived(!saving && (description.trim().length > 0 || !!photoFile));

	const clearPhoto = () => {
		if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
		photoFile = null;
		photoPreviewUrl = null;
		if (fileInputEl) fileInputEl.value = '';
	};

	const reset = () => {
		description = '';
		date = today();
		mealType = NO_MEAL;
		clearPhoto();
	};

	let wasOpen = $state(false);
	$effect(() => {
		if (wasOpen && !open) {
			onClose?.();
		}
		if (!wasOpen && open) {
			reset();
			mealTypeService.refresh();
		}
		wasOpen = open;
	});

	const handlePhotoChange = (e: Event) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			toast.error(m.ai_tasks_photo_invalid_type());
			input.value = '';
			return;
		}
		if (file.size > MAX_PHOTO_BYTES) {
			toast.error(m.ai_tasks_photo_too_large());
			input.value = '';
			return;
		}
		if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
		photoFile = file;
		photoPreviewUrl = URL.createObjectURL(file);
	};

	const submit = async () => {
		if (!canSubmit) return;
		saving = true;
		try {
			await aiTaskService.create({
				description,
				photoFile,
				date,
				mealType: mealType === NO_MEAL ? undefined : mealType
			});
			toast.success(m.ai_tasks_capture_success());
			open = false;
			onCreated?.();
		} catch (err) {
			const code = err instanceof Error ? err.message : '';
			if (code === 'offline') {
				toast.error(m.ai_tasks_offline_error());
			} else if (code === 'photo_upload_failed') {
				toast.error(m.ai_tasks_photo_upload_failed());
			} else {
				toast.error(m.error_generic());
			}
		} finally {
			saving = false;
		}
	};
</script>

<ResponsiveModal bind:open title={m.ai_tasks_capture_title()} openFull>
	<div class="grid gap-4">
		<div class="grid gap-1.5">
			<Label for="ai-task-description">{m.ai_tasks_capture_description_label()}</Label>
			<Textarea
				id="ai-task-description"
				placeholder={m.ai_tasks_capture_description_placeholder()}
				maxlength={2000}
				rows={3}
				bind:value={description}
			/>
		</div>

		<div class="grid gap-1.5">
			<Label for="ai-task-photo">{m.ai_tasks_capture_photo_label()}</Label>
			{#if photoPreviewUrl}
				<div class="relative w-fit">
					<img
						src={photoPreviewUrl}
						alt={m.ai_tasks_capture_photo_label()}
						class="h-32 w-32 rounded-lg border object-cover"
					/>
					<Button
						type="button"
						variant="secondary"
						size="icon"
						class="absolute -top-2 -right-2 size-6 rounded-full shadow"
						onclick={clearPhoto}
						aria-label={m.ai_tasks_capture_remove_photo()}
					>
						<X class="size-3.5" />
					</Button>
				</div>
			{:else}
				<div class="flex items-center gap-2">
					<Camera class="size-4 shrink-0 text-muted-foreground" />
					<input
						bind:this={fileInputEl}
						id="ai-task-photo"
						type="file"
						accept="image/*"
						capture="environment"
						onchange={handlePhotoChange}
						class="block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
					/>
				</div>
			{/if}
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div class="grid gap-1.5">
				<Label for="ai-task-date">{m.ai_tasks_capture_date_label()}</Label>
				<Input id="ai-task-date" type="date" max={today()} bind:value={date} />
			</div>
			<div class="grid gap-1.5">
				<Label>{m.ai_tasks_capture_meal_label()}</Label>
				<Select.Root type="single" bind:value={mealType}>
					<Select.Trigger class="w-full">
						{mealType === NO_MEAL ? m.ai_tasks_capture_meal_placeholder() : mealType}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value={NO_MEAL}>{m.ai_tasks_capture_meal_placeholder()}</Select.Item>
						{#each mealOptions as meal (meal)}
							<Select.Item value={meal}>{meal}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		</div>

		<p class="flex items-start gap-1.5 text-xs text-muted-foreground">
			<Sparkles class="mt-0.5 size-3.5 shrink-0" />
			{m.ai_tasks_capture_hint()}
		</p>

		<Button class="w-full" disabled={!canSubmit} onclick={submit}>
			{#if saving}
				<Spinner class="mr-1 size-4" />
			{:else}
				<Send class="mr-1 size-4" />
			{/if}
			{saving ? m.ai_tasks_capture_saving() : m.ai_tasks_capture_submit()}
		</Button>
	</div>
</ResponsiveModal>
