# Phase 8: PWA & Polish - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the app installable with offline caching, improve loading states, and add user-friendly error/toast UI.

**Architecture:** Configure `@vite-pwa/sveltekit`, add an IndexedDB cache for foods/entries, and introduce a lightweight UI layer for toasts and skeletons.

**Tech Stack:** SvelteKit 2.x, Svelte 5, Bun, @vite-pwa/sveltekit, idb

---

## Task 1: PWA Setup + Manifest

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `static/manifest.webmanifest`
- Create: `tests/utils/pwa.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { manifestName } from '../../src/lib/utils/pwa';

describe('manifestName', () => {
	test('returns app name', () => {
		expect(manifestName()).toBe('Bissbilanz');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/pwa.test.ts`
Expected: FAIL with “Cannot find module …/pwa”

**Step 3: Write minimal implementation**

Run:
```bash
bun add -d @vite-pwa/sveltekit
```

Create `src/lib/utils/pwa.ts`:
```ts
export const manifestName = () => 'Bissbilanz';
```

Modify `vite.config.ts`:
```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Bissbilanz',
				short_name: 'Bissbilanz',
				display: 'standalone',
				background_color: '#ffffff',
				theme_color: '#ffffff'
			}
		}),
		sveltekit()
	]
});
```

Create `static/manifest.webmanifest`:
```json
{
	"name": "Bissbilanz",
	"short_name": "Bissbilanz",
	"start_url": "/app",
	"display": "standalone",
	"background_color": "#ffffff",
	"theme_color": "#ffffff",
	"icons": []
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/pwa.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json bun.lock src/lib/utils/pwa.ts vite.config.ts static/manifest.webmanifest tests/utils/pwa.test.ts
git commit -m "feat: add PWA manifest"
```

---

## Task 2: IndexedDB Cache for Foods

**Files:**
- Modify: `package.json`
- Create: `src/lib/offline/db.ts`
- Create: `tests/utils/offline-db.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { cacheKey } from '../../src/lib/offline/db';

describe('cacheKey', () => {
	test('builds a key', () => {
		expect(cacheKey('foods')).toBe('bissbilanz:foods');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/offline-db.test.ts`
Expected: FAIL with “Cannot find module …/offline/db”

**Step 3: Write minimal implementation**

Run:
```bash
bun add idb
```

Create `src/lib/offline/db.ts`:
```ts
import { openDB } from 'idb';

export const cacheKey = (name: string) => `bissbilanz:${name}`;

export const offlineDb = () =>
	openDB('bissbilanz', 1, {
		upgrade(db) {
			if (!db.objectStoreNames.contains('foods')) db.createObjectStore('foods');
			if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries');
		}
	});
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/offline-db.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json bun.lock src/lib/offline/db.ts tests/utils/offline-db.test.ts
git commit -m "feat: add IndexedDB cache"
```

---

## Task 3: Offline Queue for Pending Entries

**Files:**
- Create: `src/lib/offline/queue.ts`
- Create: `tests/utils/offline-queue.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { enqueue } from '../../src/lib/offline/queue';

describe('enqueue', () => {
	test('returns a queue item', () => {
		const item = enqueue({ foodId: '1', servings: 1 });
		expect(item.id).toBeTruthy();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/offline-queue.test.ts`
Expected: FAIL with “Cannot find module …/offline/queue”

**Step 3: Write minimal implementation**

Create `src/lib/offline/queue.ts`:
```ts
export type QueueItem = { id: string; payload: any; createdAt: number };

export const enqueue = (payload: any): QueueItem => ({
	id: crypto.randomUUID(),
	payload,
	createdAt: Date.now()
});
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/offline-queue.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/offline/queue.ts tests/utils/offline-queue.test.ts
git commit -m "feat: add offline queue helpers"
```

---

## Task 4: Install Prompt + Toasts

**Files:**
- Create: `src/lib/components/ui/Toast.svelte`
- Create: `src/lib/stores/toast.svelte.ts`
- Create: `src/lib/components/pwa/InstallPrompt.svelte`
- Modify: `src/routes/+layout.svelte`
- Create: `tests/utils/toast.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { addToast } from '../../src/lib/stores/toast.svelte';

describe('addToast', () => {
	test('adds toast to list', () => {
		const state = addToast({ message: 'Saved' });
		expect(state.length).toBe(1);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/toast.test.ts`
Expected: FAIL with “Cannot find module …/toast.svelte”

**Step 3: Write minimal implementation**

Create `src/lib/stores/toast.svelte.ts`:
```ts
let toasts: Array<{ id: string; message: string }> = [];

export const addToast = ({ message }: { message: string }) => {
	const next = { id: crypto.randomUUID(), message };
	toasts = [...toasts, next];
	return toasts;
};
```

Create `src/lib/components/ui/Toast.svelte`:
```svelte
<script lang="ts">
	export let toasts: Array<{ id: string; message: string }> = [];
</script>

<div class="fixed bottom-4 right-4 space-y-2">
	{#each toasts as toast}
		<div class="rounded bg-black px-3 py-2 text-white">{toast.message}</div>
	{/each}
</div>
```

Create `src/lib/components/pwa/InstallPrompt.svelte`:
```svelte
<script lang="ts">
	let deferredPrompt: any;
	let open = false;

	window.addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		deferredPrompt = event;
		open = true;
	});

	const install = async () => {
		await deferredPrompt?.prompt();
		open = false;
	};
</script>

{#if open}
	<div class="rounded border p-4">
		<p>Install Bissbilanz?</p>
		<button class="rounded bg-black px-3 py-1 text-white" on:click={install}>Install</button>
	</div>
{/if}
```

Modify `src/routes/+layout.svelte` to render `InstallPrompt` and `Toast`.

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/toast.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/stores/toast.svelte.ts src/lib/components/ui/Toast.svelte src/lib/components/pwa/InstallPrompt.svelte src/routes/+layout.svelte tests/utils/toast.test.ts
git commit -m "feat: add install prompt and toasts"
```
