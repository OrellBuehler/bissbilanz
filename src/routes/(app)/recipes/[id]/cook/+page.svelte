<script lang="ts">
	import { liveQuery } from 'dexie';
	import { fly } from 'svelte/transition';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { db } from '$lib/db';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { recipeService } from '$lib/services/recipe-service.svelte';
	import { requestQuickAction } from '$lib/stores/command-palette.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import X from '@lucide/svelte/icons/x';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CirclePlus from '@lucide/svelte/icons/circle-plus';
	import ChefHat from '@lucide/svelte/icons/chef-hat';
	import * as m from '$lib/paraglide/messages';
	import { resolveSwipe } from '$lib/utils/swipe';
	import { createScreenWakeLock } from '$lib/utils/wake-lock';
	import { formatIngredientAmount } from '$lib/utils/recipe-steps';

	const id = $derived(page.params.id ?? '');

	const detail = useLiveQuery(() => recipeService.recipeById(id));
	const recipe = $derived(detail.value?.recipe);
	const steps = $derived(detail.value?.steps ?? []);
	const ingredients = $derived(
		[...(detail.value?.ingredients ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
	);

	const foodsQuery = useLiveQuery(() => {
		const foodIds = ingredients.map((i) => i.foodId);
		return liveQuery(() => db.foods.bulkGet(foodIds));
	});
	const foodName = (foodId: string) => foodsQuery.value?.find((f) => f?.id === foodId)?.name ?? '…';

	// Pages: 0 = ingredients, 1..n = steps, n + 1 = finished.
	const lastPage = $derived(steps.length + 1);
	let pageIndex = $state(0);
	let direction = $state<1 | -1>(1);
	const checked = $state<Record<string, boolean>>({});

	const reduceMotion = browser && matchMedia('(prefers-reduced-motion: reduce)').matches;

	const step = $derived(pageIndex >= 1 && pageIndex <= steps.length ? steps[pageIndex - 1] : null);
	const title = $derived(
		pageIndex === 0
			? m.recipe_cook_ingredients()
			: step
				? m.recipe_cook_step_of({ current: pageIndex, total: steps.length })
				: m.recipe_cook_finished_title()
	);

	const goTo = (target: number) => {
		const clamped = Math.min(Math.max(target, 0), lastPage);
		if (clamped === pageIndex) return;
		direction = clamped > pageIndex ? 1 : -1;
		pageIndex = clamped;
	};
	const next = () => goTo(pageIndex + 1);
	const previous = () => goTo(pageIndex - 1);

	const close = () => goto('/recipes');
	const logRecipe = () => {
		requestQuickAction({ type: 'add-food', recipeId: id });
		goto('/home');
	};

	let startX = 0;
	let startY = 0;
	let tracking = false;

	// Touch/pen only: `touch-action: pan-y` on the pane leaves vertical scrolling to
	// the browser, which cancels the pointer once it takes over, so only mostly
	// horizontal drags reach pointerup. Mouse users have the buttons and arrow keys.
	const onPointerDown = (e: PointerEvent) => {
		if (e.pointerType === 'mouse') return;
		tracking = true;
		startX = e.clientX;
		startY = e.clientY;
	};
	const onPointerUp = (e: PointerEvent) => {
		if (!tracking) return;
		tracking = false;
		const swipe = resolveSwipe(e.clientX - startX, e.clientY - startY);
		if (swipe === 'next') next();
		else if (swipe === 'previous') previous();
	};

	const onKeydown = (e: KeyboardEvent) => {
		const target = e.target as HTMLElement | null;
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
		if (e.key === 'ArrowRight') next();
		else if (e.key === 'ArrowLeft') previous();
		else if (e.key === 'Escape') close();
	};

	// A deep link can open before the recipe was ever cached: wait for the first
	// fetch before claiming it does not exist.
	let fetched = $state(false);
	$effect(() => {
		if (!browser) return;
		fetched = false;
		void recipeService.refreshById(id).finally(() => (fetched = true));
	});

	$effect(() => {
		if (!browser) return;
		const wakeLock = createScreenWakeLock();
		void wakeLock.acquire();
		return () => {
			void wakeLock.release();
		};
	});

	const perServingCalories = $derived(
		recipe?.calories != null && recipe.totalServings > 0
			? Math.round(recipe.calories / recipe.totalServings)
			: null
	);
</script>

<svelte:window onkeydown={onKeydown} />
<svelte:head>
	<title>{recipe?.name ?? m.recipe_start_cooking()}</title>
</svelte:head>

<div
	class="fixed inset-0 z-[100] flex flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
>
	<header class="flex items-center gap-2 px-3 pt-2">
		<Button variant="ghost" size="icon-lg" aria-label={m.recipe_cook_close()} onclick={close}>
			<X class="size-5" />
		</Button>
		<div class="min-w-0 flex-1">
			<p class="truncate text-xs text-muted-foreground">{recipe?.name ?? ''}</p>
			<h1 class="text-lg font-semibold leading-tight" aria-live="polite">{title}</h1>
		</div>
	</header>

	{#if recipe && steps.length > 0}
		<div
			class="flex gap-1 px-4 py-3"
			role="progressbar"
			aria-label={m.recipe_cook_page_indicator({ current: pageIndex + 1, total: lastPage + 1 })}
			aria-valuemin={1}
			aria-valuemax={lastPage + 1}
			aria-valuenow={pageIndex + 1}
		>
			{#each { length: lastPage + 1 } as _, i}
				<div
					class="h-1.5 flex-1 rounded-full transition-colors {i <= pageIndex
						? 'bg-primary'
						: 'bg-muted'}"
				></div>
			{/each}
		</div>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<main
			class="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain"
			onpointerdown={onPointerDown}
			onpointerup={onPointerUp}
			onpointercancel={() => (tracking = false)}
		>
			{#key pageIndex}
				<div
					class="mx-auto flex min-h-full w-full max-w-3xl flex-col px-5 py-4"
					in:fly={{ x: reduceMotion ? 0 : direction * 48, duration: reduceMotion ? 0 : 180 }}
				>
					{#if pageIndex === 0}
						<p class="mb-1 text-sm text-muted-foreground">
							{m.recipe_cook_servings({ count: recipe.totalServings })}
							{#if perServingCalories !== null}
								·
								<span class="font-medium text-blue-500">{perServingCalories} kcal</span>
							{/if}
						</p>
						<p class="mb-4 text-sm text-muted-foreground">{m.recipe_cook_ingredients_hint()}</p>
						<ul class="space-y-1">
							{#each ingredients as ingredient (ingredient.id)}
								<li>
									<label
										class="flex min-h-12 cursor-pointer items-center gap-4 rounded-xl px-2 py-2 text-lg active:bg-accent"
									>
										<Checkbox
											class="size-6 rounded-md"
											checked={checked[ingredient.id] ?? false}
											onCheckedChange={(v) => (checked[ingredient.id] = v === true)}
										/>
										<span
											class="min-w-0 flex-1 {checked[ingredient.id]
												? 'text-muted-foreground line-through'
												: ''}"
										>
											<span class="font-semibold">
												{formatIngredientAmount(ingredient.quantity, ingredient.servingUnit)}
											</span>
											{foodName(ingredient.foodId)}
										</span>
									</label>
								</li>
							{/each}
						</ul>
					{:else if step}
						{#if step.imageUrl}
							<img
								src={step.imageUrl}
								alt={m.recipe_cook_step_image({ n: pageIndex })}
								class="mb-5 max-h-[40dvh] w-full rounded-2xl border bg-muted object-contain"
							/>
						{/if}
						<p class="whitespace-pre-line text-2xl leading-relaxed sm:text-3xl">{step.text}</p>
					{:else}
						<div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
							<CircleCheck class="size-16 text-green-500" />
							<h2 class="text-2xl font-semibold">{m.recipe_cook_finished_title()}</h2>
							<p class="max-w-sm text-muted-foreground">{m.recipe_cook_finished_body()}</p>
							<div class="mt-2 flex w-full max-w-xs flex-col gap-3">
								<Button size="lg" onclick={logRecipe}>
									<CirclePlus class="size-5" />
									{m.recipe_cook_log()}
								</Button>
								<Button size="lg" variant="outline" onclick={close}>
									{m.recipe_cook_done()}
								</Button>
							</div>
						</div>
					{/if}
				</div>
			{/key}
		</main>

		<footer class="flex gap-3 border-t px-4 py-3">
			<Button
				variant="outline"
				size="lg"
				class="h-12 flex-1"
				disabled={pageIndex === 0}
				onclick={previous}
			>
				<ChevronLeft class="size-5" />
				{m.recipe_cook_back()}
			</Button>
			{#if pageIndex < lastPage}
				<Button size="lg" class="h-12 flex-1" onclick={next}>
					{m.recipe_cook_next()}
					<ChevronRight class="size-5" />
				</Button>
			{:else}
				<Button size="lg" class="h-12 flex-1" onclick={close}>
					{m.recipe_cook_done()}
				</Button>
			{/if}
		</footer>
	{:else if detail.loading || (!recipe && !fetched)}
		<div class="flex-1"></div>
	{:else}
		<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
			<ChefHat class="size-12 text-muted-foreground" />
			<p class="text-lg">
				{recipe ? m.recipe_cook_no_steps() : m.recipe_cook_not_found()}
			</p>
			<Button size="lg" variant="outline" onclick={close}>
				{m.recipe_cook_back_to_recipes()}
			</Button>
		</div>
	{/if}
</div>
