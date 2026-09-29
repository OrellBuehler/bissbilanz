<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import X from '@lucide/svelte/icons/x';
	import * as m from '$lib/paraglide/messages';
	import {
		MAX_RECIPE_STEPS,
		MAX_RECIPE_STEP_TEXT,
		moveStep,
		newStepDraft,
		type StepDraft
	} from '$lib/utils/recipe-steps';

	type Props = {
		steps: StepDraft[];
		// Stores the photo and resolves to its `/uploads/...` URL, or null on failure.
		onUploadImage?: (file: File) => Promise<string | null>;
	};

	let { steps = $bindable(), onUploadImage }: Props = $props();

	let uploadingKey = $state<string | null>(null);

	const addStep = () => {
		if (steps.length >= MAX_RECIPE_STEPS) return;
		steps = [...steps, newStepDraft()];
	};

	const removeStep = (index: number) => {
		steps = steps.filter((_, i) => i !== index);
	};

	const move = (index: number, direction: -1 | 1) => {
		steps = moveStep(steps, index, direction);
	};

	const pickImage = async (key: string, file: File | undefined) => {
		if (!file || !onUploadImage || uploadingKey) return;
		uploadingKey = key;
		try {
			const url = await onUploadImage(file);
			const step = steps.find((s) => s.key === key);
			if (url && step) step.imageUrl = url;
		} finally {
			uploadingKey = null;
		}
	};
</script>

<div class="space-y-3">
	{#each steps as step, i (step.key)}
		<div class="space-y-2 rounded-lg border p-3">
			<div class="flex items-center gap-1">
				<span
					class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
					aria-hidden="true"
				>
					{i + 1}
				</span>
				<span class="ml-1 text-sm font-medium">{m.recipe_form_step_label({ n: i + 1 })}</span>
				<div class="ml-auto flex items-center">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						disabled={i === 0}
						aria-label={m.recipe_form_step_move_up({ n: i + 1 })}
						onclick={() => move(i, -1)}
					>
						<ChevronUp class="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						disabled={i === steps.length - 1}
						aria-label={m.recipe_form_step_move_down({ n: i + 1 })}
						onclick={() => move(i, 1)}
					>
						<ChevronDown class="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={m.recipe_form_step_remove({ n: i + 1 })}
						onclick={() => removeStep(i)}
					>
						<Trash2 class="size-4 text-destructive" />
					</Button>
				</div>
			</div>
			<Textarea
				bind:value={step.text}
				rows={3}
				maxlength={MAX_RECIPE_STEP_TEXT}
				placeholder={m.recipe_form_step_placeholder()}
				aria-label={m.recipe_form_step_label({ n: i + 1 })}
			/>
			{#if onUploadImage}
				<div class="flex items-center gap-2">
					{#if step.imageUrl}
						<div class="relative">
							<img
								src={step.imageUrl}
								alt={m.recipe_cook_step_image({ n: i + 1 })}
								class="size-20 rounded-lg border object-cover"
							/>
							<Button
								type="button"
								variant="secondary"
								size="icon"
								class="absolute -right-2 -top-2 size-6 rounded-full shadow"
								aria-label={m.recipe_form_step_remove_photo({ n: i + 1 })}
								onclick={() => (step.imageUrl = null)}
							>
								<X class="size-3" />
							</Button>
						</div>
					{/if}
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={uploadingKey !== null}
						aria-label={m.recipe_form_step_add_photo({ n: i + 1 })}
						onclick={(e) => {
							const input = e.currentTarget.parentElement?.querySelector('input[type=file]');
							(input as HTMLInputElement | null)?.click();
						}}
					>
						{#if uploadingKey === step.key}
							<Spinner class="size-4" />
						{:else}
							<ImagePlus class="size-4" />
						{/if}
						<span class="hidden sm:inline">{m.image_upload_label()}</span>
					</Button>
					<input
						type="file"
						accept="image/*"
						class="hidden"
						tabindex="-1"
						onchange={async (e) => {
							const input = e.currentTarget;
							await pickImage(step.key, input.files?.[0]);
							input.value = '';
						}}
					/>
				</div>
			{/if}
		</div>
	{/each}
	<Button
		variant="outline"
		size="sm"
		type="button"
		disabled={steps.length >= MAX_RECIPE_STEPS}
		onclick={addStep}
	>
		<Plus class="size-4" />
		{m.recipe_form_add_step()}
	</Button>
</div>
