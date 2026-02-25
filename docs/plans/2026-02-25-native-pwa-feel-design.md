# Native PWA Feel Improvements

## Goal

Make the Bissbilanz PWA feel native by adding view transitions, gesture handling, and CSS polish.

## Approach: Balanced (View Transitions + svelte-gestures + CSS)

### Layer 1: View Transitions (Navigation Feel)

Add the View Transitions API via SvelteKit's `onNavigate` hook.

**Setup:**

- `onNavigate` in root `+layout.svelte` calls `document.startViewTransition()`
- Graceful degradation: null check on `document.startViewTransition`
- All transitions controlled via CSS

**Transitions:**

- Default cross-fade on all page navigations
- Shared element transitions for list→detail flows:
  - Food list → food detail (food name/image)
  - Recipe list → recipe detail
  - History date list → date detail
- `view-transition-name` assigned dynamically (e.g. `food-{id}`)

**CSS animations:**

- `::view-transition-old(root)` / `::view-transition-new(root)` for page-level
- Keep durations short: 150-200ms
- Slide direction based on navigation depth (forward = slide left, back = slide right)

### Layer 2: Gesture Handling (svelte-gestures v5.x)

Single new dependency: `svelte-gestures` — Svelte 5 native, tree-shakeable.

**Gestures to implement:**

- Swipe-right anywhere to navigate back (global action in app layout)
- Swipe on meal entry rows for quick actions (delete/edit)

### Layer 3: CSS Native Feel Polish

Zero-dependency CSS changes in `app.css`:

```css
@media (display-mode: standalone) {
	html {
		overscroll-behavior: none;
	}
	button,
	a,
	nav,
	[role='button'] {
		user-select: none;
		-webkit-user-select: none;
	}
	* {
		-webkit-tap-highlight-color: transparent;
	}
	body {
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
			env(safe-area-inset-left);
	}
}
```

## Out of Scope

- Heavy animation libraries (use Svelte built-in spring/tweened if needed)
- Bottom tab bar (keeping sidebar)
- Complex orchestrated animations

## Dependencies

- `svelte-gestures` v5.x (new)
- View Transitions API (browser-native, no package)

## Browser Support

- View Transitions: Chrome, Edge, Safari 18+, Firefox 126+ (~90%+)
- Graceful degradation: older browsers get no transitions (no broken UX)
