# Native PWA Feel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Bissbilanz feel native with view transitions, gesture handling, and CSS polish.

**Architecture:** Three layers — (1) View Transitions API via SvelteKit's `onNavigate`, (2) `svelte-gestures` for swipe interactions, (3) CSS `@media (display-mode: standalone)` rules for native feel polish. No heavy dependencies.

**Tech Stack:** SvelteKit 2.x, Svelte 5, View Transitions API (browser-native), `svelte-gestures` v5.x

**Design doc:** `docs/plans/2026-02-25-native-pwa-feel-design.md`

---

### Task 1: CSS Native Feel Polish

Add standalone-mode CSS rules for native feel. This is the highest-ROI change — zero JS, immediate effect.

**Files:**

- Modify: `src/app.css`

**Step 1: Add standalone PWA styles to app.css**

Add after the existing `@media (pointer: coarse)` block inside `@layer base`:

```css
@media (display-mode: standalone) {
	html {
		overscroll-behavior: none;
	}
	* {
		-webkit-tap-highlight-color: transparent;
	}
	body {
		padding-top: env(safe-area-inset-top);
		padding-right: env(safe-area-inset-right);
		padding-bottom: env(safe-area-inset-bottom);
		padding-left: env(safe-area-inset-left);
	}
}
```

Note: `user-select: none` is already handled by the existing `@media (pointer: coarse)` block, so we don't duplicate it.

**Step 2: Verify dev server starts**

Run: `bun run dev` (briefly, ctrl+c after it starts)
Expected: No errors, app loads normally

**Step 3: Commit**

```bash
git add src/app.css
git commit -m "feat: add standalone PWA CSS for native feel"
```

---

### Task 2: View Transitions — Basic Setup

Add the View Transitions API to all page navigations via `onNavigate`.

**Files:**

- Modify: `src/routes/+layout.svelte`
- Modify: `src/app.css`

**Step 1: Add onNavigate view transition hook**

In `src/routes/+layout.svelte`, add the import and hook:

```svelte
<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { onNavigate } from '$app/navigation';

	let { children } = $props();

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
<Toaster />
```

**Step 2: Add view transition CSS**

In `src/app.css`, add after `@layer base`:

```css
@layer base {
	/* ... existing rules ... */
}

/* View transition animations */
::view-transition-old(root) {
	animation: vt-fade-out 150ms ease-out;
}
::view-transition-new(root) {
	animation: vt-fade-in 150ms ease-in;
}

@keyframes vt-fade-out {
	to {
		opacity: 0;
	}
}
@keyframes vt-fade-in {
	from {
		opacity: 0;
	}
}
```

**Step 3: Verify transitions work**

Run: `bun run dev`
Expected: Navigate between pages in browser — should see a subtle cross-fade on each navigation. On browsers without View Transitions API, navigation works normally (no errors).

**Step 4: Run type check**

Run: `bun run check`

If TypeScript complains about `document.startViewTransition`, add a type declaration. Create `src/view-transitions.d.ts`:

```ts
interface Document {
	startViewTransition?(callback: () => Promise<void> | void): ViewTransition;
}

interface ViewTransition {
	finished: Promise<void>;
	ready: Promise<void>;
	updateCallbackDone: Promise<void>;
}
```

**Step 5: Commit**

```bash
git add src/routes/+layout.svelte src/app.css
# Also add src/view-transitions.d.ts if created
git commit -m "feat: add view transitions for page navigation"
```

---

### Task 3: Install svelte-gestures

**Step 1: Install the package**

Run: `bun add -d svelte-gestures`

**Step 2: Verify installation**

Run: `bun run check`
Expected: No new errors

**Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add svelte-gestures dependency"
```

---

### Task 4: Swipe-Back Navigation Gesture

Add a global swipe-right gesture to navigate back.

**Files:**

- Modify: `src/routes/(app)/+layout.svelte`

**Step 1: Add swipe-back gesture to the app layout**

The swipe handler should only trigger on swipe-right from the left edge of the screen (to avoid conflicting with horizontal scrolling content). Use a Svelte action wrapping `svelte-gestures`:

```svelte
<script lang="ts">
	import { setUser } from '$lib/stores/auth.svelte';
	import { startSyncListener } from '$lib/stores/sync';
	import AppSidebar from '$lib/components/navigation/app-sidebar.svelte';
	import SiteHeader from '$lib/components/navigation/site-header.svelte';
	import InstallBanner from '$lib/components/pwa/InstallBanner.svelte';
	import OfflineIndicator from '$lib/components/pwa/OfflineIndicator.svelte';
	import UpdateToast from '$lib/components/pwa/UpdateToast.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { LayoutData } from './$types';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { swipe } from 'svelte-gestures';

	let { data, children }: { data: LayoutData; children: any } = $props();

	$effect(() => {
		setUser(data.user);
	});

	onMount(() => {
		startSyncListener(() => {
			invalidateAll();
			window.dispatchEvent(new CustomEvent('queue-synced'));
		});
	});

	function handleSwipe(e: CustomEvent<{ direction: string; target: EventTarget | null }>) {
		if (e.detail.direction === 'right') {
			history.back();
		}
	}
</script>

<InstallBanner />
<div
	use:swipe={{ timeframe: 300, minSwipeDistance: 80, touchAction: 'pan-y' }}
	onswipe={handleSwipe}
	class="contents"
>
	<Sidebar.Provider
		style="--sidebar-width: calc(var(--spacing) * 72); --header-height: calc(var(--spacing) * 12);"
	>
		<AppSidebar variant="inset" />
		<Sidebar.Inset>
			<SiteHeader />
			<OfflineIndicator />
			<div class="flex flex-1 flex-col">
				<main class="flex-1 px-3 py-4 sm:p-4 lg:p-6">
					{@render children()}
				</main>
			</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
</div>
<UpdateToast />
```

Key details:

- `minSwipeDistance: 80` — prevents accidental triggers
- `touchAction: 'pan-y'` — allows vertical scrolling while capturing horizontal swipes
- `class="contents"` — the wrapper div doesn't affect layout
- Only swipe-right triggers `history.back()`

**Step 2: Verify gestures work**

Run: `bun run dev`
Test on a mobile device or Chrome DevTools mobile emulation:

- Navigate to a sub-page (e.g. `/foods/[id]`)
- Swipe right — should go back
- Swipe left — should do nothing
- Vertical scrolling should still work normally

**Step 3: Run type check**

Run: `bun run check`

Note: `svelte-gestures` uses custom events. If TypeScript complains about `onswipe`, the event type may need to be handled. Check if `svelte-gestures` exports proper types for Svelte 5. If not, you can use `on:swipe` (Svelte 4 syntax still works) or add the event handler via the action callback.

If the `use:swipe` + `onswipe` pattern doesn't work with Svelte 5's event system, use the callback pattern instead:

```svelte
<div
	use:swipe={{ timeframe: 300, minSwipeDistance: 80, touchAction: 'pan-y' }}
	on:swipe={handleSwipe}
	class="contents"
>
```

**Step 4: Commit**

```bash
git add src/routes/\(app\)/+layout.svelte
git commit -m "feat: add swipe-right to navigate back"
```

---

### Task 5: Swipe-to-Delete on Meal Entries

Add swipe-left on individual meal entries to reveal a delete action.

**Files:**

- Modify: `src/lib/components/entries/MealSection.svelte`
- Create: `src/lib/components/entries/SwipeableEntry.svelte`

**Step 1: Create SwipeableEntry component**

This component wraps a single entry row, adds a swipe-left gesture to reveal a delete button behind it.

`src/lib/components/entries/SwipeableEntry.svelte`:

```svelte
<script lang="ts">
	import { spring } from 'svelte/motion';
	import { pan } from 'svelte-gestures';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { Snippet } from 'svelte';

	type Props = {
		onDelete?: () => void;
		children: Snippet;
	};

	let { onDelete, children }: Props = $props();

	let offsetX = spring(0, { stiffness: 0.3, damping: 0.8 });
	let swiping = $state(false);
	const DELETE_THRESHOLD = -80;

	function handlePan(e: CustomEvent<{ x: number; target: EventTarget | null }>) {
		const x = e.detail.x;
		if (x > 0) {
			offsetX.set(0);
			return;
		}
		swiping = true;
		offsetX.set(Math.max(x, -100), { hard: true });
	}

	function handlePanEnd() {
		if ($offsetX < DELETE_THRESHOLD && onDelete) {
			onDelete();
		}
		offsetX.set(0);
		swiping = false;
	}
</script>

<div class="relative overflow-hidden rounded-lg">
	<!-- Delete action behind -->
	<div
		class="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-destructive text-destructive-foreground"
	>
		<Trash2 class="size-5" />
	</div>

	<!-- Swipeable content -->
	<div
		use:pan={{ delay: 0, touchAction: 'pan-y' }}
		onpanmove={handlePan}
		onpanend={handlePanEnd}
		style="transform: translateX({$offsetX}px)"
		class="relative bg-card"
		class:transition-transform={!swiping}
	>
		{@render children()}
	</div>
</div>
```

Note: The exact event names from `svelte-gestures` for pan may be `panmove`/`panend` or `pan` with sub-events. Check the library docs during implementation. The pattern above uses `on:panmove`/`on:panend` — adapt to whatever the library actually dispatches. If `svelte-gestures` dispatches a single `pan` event, restructure to use that.

**Step 2: Integrate into MealSection**

In `src/lib/components/entries/MealSection.svelte`, wrap each entry `<li>` with `SwipeableEntry` when not readonly:

Replace the `{#each entries as entry}` block inside the `mealList` snippet. The entry row content stays the same, but is wrapped:

```svelte
{#each entries as entry}
	{#if !readonly && onEdit}
		<SwipeableEntry
			onDelete={() =>
				onEdit?.({
					id: entry.id,
					servings: entry.servings,
					mealType: entry.mealType,
					foodName: entry.foodName ?? undefined
				})}
		>
			<li
				class={dashboardStyle
					? 'flex items-center justify-between rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm'
					: 'flex items-center justify-between text-sm'}
			>
				<!-- ... existing entry content ... -->
			</li>
		</SwipeableEntry>
	{:else}
		<li class={dashboardStyle ? '...' : '...'}>
			<!-- ... existing readonly content ... -->
		</li>
	{/if}
{/each}
```

Note: For the swipe-to-delete, we reuse the `onEdit` callback to open the edit modal (which has a delete button). A dedicated `onDelete` prop could be added later if direct delete-on-swipe is desired.

**Step 3: Verify swipe works**

Run: `bun run dev`
Test: On the dashboard meal sections, swipe left on an entry — should reveal red delete area behind. Release early returns to position. Swipe far enough opens the edit modal.

**Step 4: Run type check**

Run: `bun run check`
Expected: No errors

**Step 5: Commit**

```bash
git add src/lib/components/entries/SwipeableEntry.svelte src/lib/components/entries/MealSection.svelte
git commit -m "feat: add swipe-to-action on meal entries"
```

---

### Task 6: Final Verification

**Step 1: Run full type check**

Run: `bun run check`
Expected: No errors

**Step 2: Test all features manually**

Run: `bun run dev`

Checklist:

- [ ] Page navigation shows cross-fade transition
- [ ] Swipe right navigates back
- [ ] Swipe left on meal entries reveals delete action
- [ ] Vertical scrolling works normally (no gesture conflicts)
- [ ] App works normally on desktop (no regressions)
- [ ] No console errors

**Step 3: Run security scan**

Run: `bun run security`
Expected: No new findings from added code

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: address native PWA feel review findings"
```
