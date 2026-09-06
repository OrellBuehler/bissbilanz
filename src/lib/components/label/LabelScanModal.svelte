<script lang="ts">
	import * as Sentry from '@sentry/sveltekit';
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import NumberInput from '$lib/components/shared/NumberInput.svelte';
	import AlertCircle from '@lucide/svelte/icons/alert-circle';
	import Camera from '@lucide/svelte/icons/camera';
	import Check from '@lucide/svelte/icons/check';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { mapCameraError, startCamera, stopCamera } from '$lib/utils/camera';
	import { captureFrame, prepareImage } from '$lib/ocr/image';
	import { recognizeLabel, type OcrPhase } from '$lib/ocr/label-ocr';
	import {
		isEmpty,
		PARSED_NUTRITION_KEYS,
		toFoodFormPatch,
		type FoodFormPatch,
		type ParsedNutrition,
		type ParsedNutritionKey
	} from '$lib/label-parser';
	import { NUTRIENT_BY_KEY } from '$lib/nutrients';
	import { nutrientLabel } from '$lib/nutrients-i18n';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open?: boolean;
		onApply: (patch: FoodFormPatch) => void;
	};

	let { open = $bindable(false), onApply }: Props = $props();

	type Stage = 'capture' | 'camera' | 'scanning' | 'review';

	let stage = $state<Stage>('capture');
	let error = $state('');
	let notFound = $state(false);
	let phase = $state<OcrPhase>('loading');
	let progress = $state(0);
	let values = $state<Partial<Record<ParsedNutritionKey, number | null>>>({});
	let basis = $state<'hundred' | 'serving'>('hundred');
	let servingSize = $state<number | null>(100);
	let servingUnit = $state<'g' | 'ml'>('g');

	let fileInput = $state<HTMLInputElement>();
	let videoEl = $state<HTMLVideoElement>();
	let stream: MediaStream | null = null;

	const coreLabels: Partial<Record<ParsedNutritionKey, () => string>> = {
		calories: m.food_form_calories,
		protein: m.food_form_protein,
		carbs: m.food_form_carbs,
		fat: m.food_form_fat,
		fiber: m.food_form_fiber
	};

	const fieldLabel = (key: ParsedNutritionKey): string => {
		const core = coreLabels[key];
		if (core) return core();
		const nutrient = NUTRIENT_BY_KEY.get(key);
		return nutrient ? nutrientLabel(nutrient) : key;
	};

	const fieldUnit = (key: ParsedNutritionKey): string =>
		key === 'calories' ? 'kcal' : (NUTRIENT_BY_KEY.get(key)?.unit ?? 'g');

	const unitLabel = (unit: 'g' | 'ml') =>
		unit === 'g' ? m.food_form_unit_g() : m.food_form_unit_ml();

	let reviewKeys = $derived(PARSED_NUTRITION_KEYS.filter((key) => key in values));

	const releaseCamera = () => {
		stopCamera(stream);
		stream = null;
	};

	const reset = () => {
		releaseCamera();
		stage = 'capture';
		error = '';
		notFound = false;
		progress = 0;
		values = {};
		basis = 'hundred';
		servingSize = 100;
		servingUnit = 'g';
	};

	$effect(() => {
		if (!open) reset();
	});

	onDestroy(releaseCamera);

	const openCamera = async () => {
		if (!browser) return;
		error = '';
		notFound = false;
		stage = 'camera';
		await Promise.resolve();
		if (!videoEl) return;
		try {
			stream = await startCamera(videoEl);
		} catch (err) {
			const kind = mapCameraError(err);
			if (kind !== 'permission_denied' && kind !== 'not_found') {
				Sentry.captureException(err, {
					tags: { feature: 'label-scan', stage: 'camera' },
					extra: { errorKind: kind }
				});
			}
			const messages: Record<string, () => string> = {
				permission_denied: m.barcode_camera_denied,
				not_found: m.barcode_camera_not_found,
				overconstrained: m.barcode_camera_overconstrained
			};
			error = (messages[kind] ?? m.barcode_camera_error)();
			stage = 'capture';
		}
	};

	const scan = async (source: Blob) => {
		stage = 'scanning';
		error = '';
		notFound = false;
		phase = 'loading';
		progress = 0;

		try {
			const prepared = await prepareImage(source);
			const { parsed } = await recognizeLabel(prepared, (update) => {
				phase = update.phase;
				progress = update.progress;
			});
			if (isEmpty(parsed)) {
				notFound = true;
				stage = 'capture';
				return;
			}
			values = { ...parsed };
			stage = 'review';
		} catch (err) {
			Sentry.captureException(err, { tags: { feature: 'label-scan', stage: 'ocr' } });
			error = m.label_scan_error();
			stage = 'capture';
		}
	};

	const handleFile = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) await scan(file);
	};

	const handleCapture = async () => {
		if (!videoEl) return;
		const frame = await captureFrame(videoEl);
		releaseCamera();
		await scan(frame);
	};

	const apply = () => {
		const parsed: ParsedNutrition = {};
		for (const key of PARSED_NUTRITION_KEYS) {
			const value = values[key];
			if (value != null) parsed[key] = value;
		}
		onApply(
			toFoodFormPatch(parsed, {
				servingSize: basis === 'hundred' ? 100 : (servingSize ?? 100),
				servingUnit
			})
		);
		open = false;
	};
</script>

<ResponsiveModal bind:open title={m.label_scan_title()} openFull>
	<div class="space-y-4">
		{#if error}
			<Alert.Root variant="destructive">
				<AlertCircle class="size-4" />
				<Alert.Title>{m.barcode_error()}</Alert.Title>
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}

		{#if notFound}
			<Alert.Root>
				<AlertCircle class="size-4" />
				<Alert.Title>{m.label_scan_failed()}</Alert.Title>
				<Alert.Description>{m.label_scan_failed_desc()}</Alert.Description>
			</Alert.Root>
		{/if}

		{#if stage === 'capture'}
			<p class="text-muted-foreground text-sm">{m.label_scan_hint()}</p>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				capture="environment"
				class="hidden"
				onchange={handleFile}
			/>
			<div class="grid gap-2 sm:grid-cols-2">
				<Button onclick={() => fileInput?.click()}>
					<ImagePlus class="size-4" />
					{m.label_scan_choose_image()}
				</Button>
				<Button variant="outline" onclick={openCamera}>
					<Camera class="size-4" />
					{m.label_scan_use_camera()}
				</Button>
				{#if notFound}
					<Button variant="ghost" onclick={() => (open = false)}>{m.label_scan_manual()}</Button>
				{/if}
			</div>
			<p class="text-muted-foreground text-xs">{m.label_scan_assets_note()}</p>
		{:else if stage === 'camera'}
			<div class="relative mx-auto w-full max-w-md overflow-hidden rounded-lg">
				<!-- svelte-ignore a11y_media_has_caption -->
				<video
					bind:this={videoEl}
					class="w-full"
					muted
					playsinline
					autoplay
					aria-label={m.label_scan_title()}
				></video>
				<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
					<div
						class="border-primary h-2/3 w-11/12 rounded-lg border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"
					></div>
				</div>
			</div>
			<p class="text-muted-foreground text-center text-sm">{m.label_scan_hint()}</p>
			<Button class="w-full" onclick={handleCapture}>
				<Camera class="size-4" />
				{m.label_scan_capture()}
			</Button>
		{:else if stage === 'scanning'}
			<div class="space-y-3 py-6">
				<p class="text-center text-sm">
					{phase === 'recognizing' ? m.label_scan_recognizing() : m.label_scan_loading()}
				</p>
				<Progress value={Math.round(progress * 100)} />
			</div>
		{:else}
			<p class="text-muted-foreground text-sm">{m.label_scan_review_hint()}</p>

			<div class="grid gap-1.5">
				<Label>{m.label_scan_basis()}</Label>
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<ToggleGroup.Root
						type="single"
						variant="outline"
						value={basis}
						onValueChange={(value) => {
							if (value) basis = value as 'hundred' | 'serving';
						}}
					>
						<ToggleGroup.Item value="hundred">{m.label_scan_basis_hundred()}</ToggleGroup.Item>
						<ToggleGroup.Item value="serving">{m.label_scan_basis_serving()}</ToggleGroup.Item>
					</ToggleGroup.Root>
					<Select.Root type="single" bind:value={servingUnit}>
						<Select.Trigger class="w-24">{unitLabel(servingUnit)}</Select.Trigger>
						<Select.Content>
							<Select.Item value="g">{m.food_form_unit_g()}</Select.Item>
							<Select.Item value="ml">{m.food_form_unit_ml()}</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			{#if basis === 'serving'}
				<div class="grid gap-1.5">
					<Label for="label-scan-serving">{m.food_form_serving_size()}</Label>
					<NumberInput id="label-scan-serving" bind:value={servingSize} />
				</div>
			{/if}

			<div class="grid gap-2 sm:grid-cols-2">
				{#each reviewKeys as key (key)}
					<div class="grid gap-1.5">
						<Label for={`label-scan-${key}`}>{fieldLabel(key)} ({fieldUnit(key)})</Label>
						<NumberInput
							id={`label-scan-${key}`}
							bind:value={() => values[key] ?? null, (value) => (values[key] = value)}
						/>
					</div>
				{/each}
			</div>

			<div class="flex flex-wrap gap-2">
				<Button onclick={apply}>
					<Check class="size-4" />
					{m.label_scan_apply()}
				</Button>
				<Button variant="outline" onclick={reset}>
					<RotateCcw class="size-4" />
					{m.label_scan_retry()}
				</Button>
			</div>
		{/if}
	</div>
</ResponsiveModal>
