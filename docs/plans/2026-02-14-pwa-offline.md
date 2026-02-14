# PWA & Offline Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Bissbilanz a fully functional PWA with install prompt, offline reading, offline write queue with background sync, and auto-update notifications.

**Architecture:** Build on existing `@vite-pwa/sveltekit` setup. Add an offline queue using IndexedDB for pending writes. Use a custom service worker for background sync. Show connectivity status in the app header.

**Tech Stack:** SvelteKit, @vite-pwa/sveltekit, Workbox, IndexedDB, Svelte 5 runes

---

### Task 1: Install Prompt Banner

**Files:**
- Create: `src/lib/components/pwa/InstallBanner.svelte`
- Modify: `src/routes/app/+layout.svelte`

**Step 1: Create InstallBanner component**

Listens for `beforeinstallprompt` event. Shows a dismissible banner. Stores dismissal in localStorage with key `bissbilanz-install-dismissed`.

```svelte
<script lang="ts">
	import { browser } from '$app/environment';
	import { X, Download } from '@lucide/svelte';

	let deferredPrompt: any = $state(null);
	let dismissed = $state(false);

	if (browser) {
		dismissed = localStorage.getItem('bissbilanz-install-dismissed') === 'true';
		window.addEventListener('beforeinstallprompt', (e: Event) => {
			e.preventDefault();
			deferredPrompt = e;
		});
	}

	function install() {
		deferredPrompt?.prompt();
		deferredPrompt = null;
	}

	function dismiss() {
		dismissed = true;
		localStorage.setItem('bissbilanz-install-dismissed', 'true');
		deferredPrompt = null;
	}
</script>

{#if deferredPrompt && !dismissed}
	<div class="flex items-center gap-3 bg-primary/10 px-4 py-2 text-sm">
		<Download class="h-4 w-4 shrink-0" />
		<span class="flex-1">Install Bissbilanz for quick access</span>
		<button onclick={install} class="font-medium text-primary underline">Install</button>
		<button onclick={dismiss} class="text-muted-foreground">
			<X class="h-4 w-4" />
		</button>
	</div>
{/if}
```

**Step 2: Add to app layout**

Import and place `InstallBanner` at the top of the layout, above the header.

**Step 3: Verify**

Test in Chrome DevTools (Application > Manifest). The banner should appear if the PWA criteria are met. Dismissing should persist across page loads.

**Step 4: Commit**

```
feat: add PWA install prompt banner
```

---

### Task 2: Offline Indicator

**Files:**
- Create: `src/lib/components/pwa/OfflineIndicator.svelte`
- Modify: `src/routes/app/+layout.svelte`

**Step 1: Create OfflineIndicator component**

Shows a small banner when the browser goes offline. Uses `navigator.onLine` and `online`/`offline` events.

```svelte
<script lang="ts">
	import { browser } from '$app/environment';
	import { WifiOff } from '@lucide/svelte';

	let online = $state(browser ? navigator.onLine : true);

	if (browser) {
		window.addEventListener('online', () => (online = true));
		window.addEventListener('offline', () => (online = false));
	}
</script>

{#if !online}
	<div class="flex items-center justify-center gap-2 bg-destructive px-4 py-1 text-xs text-destructive-foreground">
		<WifiOff class="h-3 w-3" />
		<span>You're offline — changes will sync when reconnected</span>
	</div>
{/if}
```

**Step 2: Add to app layout**

Place below the header in the layout.

**Step 3: Verify**

Use Chrome DevTools Network tab to toggle offline mode. Banner should appear/disappear.

**Step 4: Commit**

```
feat: add offline connectivity indicator
```

---

### Task 3: Offline Write Queue — IndexedDB Store

**Files:**
- Create: `src/lib/stores/offline-queue.ts`

**Step 1: Create offline queue store**

Uses IndexedDB to persist queued API writes. Each entry stores: method, URL, body, timestamp.

```typescript
import { browser } from '$app/environment';

export interface QueuedRequest {
	id?: number;
	method: string;
	url: string;
	body: string;
	createdAt: number;
}

const DB_NAME = 'bissbilanz-offline';
const STORE_NAME = 'requests';

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			req.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function enqueue(method: string, url: string, body: object): Promise<void> {
	if (!browser) return;
	const db = await openDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	tx.objectStore(STORE_NAME).add({ method, url, body: JSON.stringify(body), createdAt: Date.now() });
	await new Promise((resolve, reject) => {
		tx.oncomplete = resolve;
		tx.onerror = reject;
	});
}

export async function drainQueue(): Promise<QueuedRequest[]> {
	if (!browser) return [];
	const db = await openDB();
	const tx = db.transaction(STORE_NAME, 'readonly');
	const store = tx.objectStore(STORE_NAME);
	return new Promise((resolve, reject) => {
		const req = store.getAll();
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function removeFromQueue(id: number): Promise<void> {
	if (!browser) return;
	const db = await openDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	tx.objectStore(STORE_NAME).delete(id);
	await new Promise((resolve, reject) => {
		tx.oncomplete = resolve;
		tx.onerror = reject;
	});
}
```

**Step 2: Commit**

```
feat: add IndexedDB offline write queue
```

---

### Task 4: Offline-Aware Fetch Wrapper

**Files:**
- Create: `src/lib/utils/api.ts`

**Step 1: Create fetch wrapper**

A helper that wraps `fetch` for write operations. If offline, queues the request and returns a synthetic success response. If online, sends normally.

```typescript
import { browser } from '$app/environment';
import { enqueue } from '$lib/stores/offline-queue';

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
	const method = options.method?.toUpperCase() ?? 'GET';
	const isWrite = method === 'POST' || method === 'PATCH' || method === 'DELETE';

	if (browser && !navigator.onLine && isWrite) {
		const body = options.body ? JSON.parse(options.body as string) : {};
		await enqueue(method, url, body);
		// Return synthetic success so UI updates optimistically
		return new Response(JSON.stringify({ queued: true }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	}

	return fetch(url, options);
}
```

**Step 2: Commit**

```
feat: add offline-aware API fetch wrapper
```

---

### Task 5: Background Sync on Reconnect

**Files:**
- Create: `src/lib/stores/sync.ts`
- Modify: `src/routes/app/+layout.svelte`

**Step 1: Create sync module**

Listens for `online` event and drains the queue, replaying requests in order.

```typescript
import { browser } from '$app/environment';
import { drainQueue, removeFromQueue } from '$lib/stores/offline-queue';

let syncing = false;

export async function syncQueue(): Promise<number> {
	if (!browser || syncing || !navigator.onLine) return 0;
	syncing = true;
	let synced = 0;

	try {
		const queued = await drainQueue();
		for (const req of queued) {
			try {
				const response = await fetch(req.url, {
					method: req.method,
					headers: { 'content-type': 'application/json' },
					body: req.method !== 'DELETE' ? req.body : undefined
				});
				if (response.ok || response.status === 400) {
					// Remove on success or validation error (don't retry bad requests)
					await removeFromQueue(req.id!);
					synced++;
				}
			} catch {
				// Network error — stop trying, will retry on next online event
				break;
			}
		}
	} finally {
		syncing = false;
	}
	return synced;
}

export function startSyncListener(): void {
	if (!browser) return;
	window.addEventListener('online', () => syncQueue());
}
```

**Step 2: Initialize sync listener in app layout**

In `+layout.svelte`, import and call `startSyncListener()` on mount.

**Step 3: Verify**

- Go offline in DevTools
- Log a food entry (should succeed via queue)
- Go back online — queued request should sync
- Check the entry appears correctly after sync

**Step 4: Commit**

```
feat: add background sync for offline writes
```

---

### Task 6: Migrate Dashboard API Calls to apiFetch

**Files:**
- Modify: `src/routes/app/+page.svelte`

**Step 1: Replace write fetch calls with apiFetch**

Import `apiFetch` from `$lib/utils/api`. Replace the `fetch()` calls in `addEntry()`, `updateEntry()`, `deleteEntry()`, and `copyYesterday()` with `apiFetch()`. Keep read operations (`loadData`) using regular `fetch` (they use the Workbox cache).

**Step 2: Verify**

- Normal online usage should work identically
- Offline writes should queue and sync

**Step 3: Commit**

```
refactor: use offline-aware fetch for dashboard writes
```

---

### Task 7: Auto-Update Toast

**Files:**
- Create: `src/lib/components/pwa/UpdateToast.svelte`
- Modify: `src/routes/app/+layout.svelte`

**Step 1: Create UpdateToast component**

Detects when a new service worker is available and shows a toast prompting refresh.

```svelte
<script lang="ts">
	import { browser } from '$app/environment';

	let showUpdate = $state(false);

	if (browser && 'serviceWorker' in navigator) {
		navigator.serviceWorker.ready.then((registration) => {
			registration.addEventListener('updatefound', () => {
				const newWorker = registration.installing;
				newWorker?.addEventListener('statechange', () => {
					if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
						showUpdate = true;
					}
				});
			});
		});
	}

	function reload() {
		window.location.reload();
	}
</script>

{#if showUpdate}
	<div class="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm rounded-lg border bg-background p-4 shadow-lg">
		<p class="text-sm font-medium">A new version is available</p>
		<button onclick={reload} class="mt-2 text-sm font-medium text-primary underline">
			Refresh to update
		</button>
	</div>
{/if}
```

**Step 2: Add to layout**

Import and place `UpdateToast` in the app layout.

**Step 3: Commit**

```
feat: add auto-update toast for new service worker versions
```

---

### Task 8: Verify Full PWA Setup

**Step 1: Build and preview**

Run: `bun run build && bun run preview`

**Step 2: Test in Chrome**

- Open Chrome DevTools > Application
- Verify manifest loads correctly
- Verify service worker registers
- Test install flow
- Test offline mode (pages should load from cache)
- Test offline write + sync

**Step 3: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 4: Commit any fixes**

```
fix: PWA adjustments from integration testing
```
