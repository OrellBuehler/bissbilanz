# Phase 6: Barcode Scanning - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable barcode scanning for quick food lookup and creation.

**Architecture:** Add a reusable barcode scanner component (client-only), extend the foods API to search by barcode, and integrate the scanner into the food form and dashboard quick-add flow.

**Tech Stack:** SvelteKit 2.x, Svelte 5, Bun, Drizzle ORM, PostgreSQL, html5-qrcode

---

## Task 1: Barcode Utilities

**Files:**
- Create: `src/lib/utils/barcode.ts`
- Create: `tests/utils/barcode.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { normalizeBarcode } from '../../src/lib/utils/barcode';

describe('normalizeBarcode', () => {
	test('strips spaces and preserves digits', () => {
		expect(normalizeBarcode(' 012 345 ')).toBe('012345');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/barcode.test.ts`
Expected: FAIL with “Cannot find module …/barcode”

**Step 3: Write minimal implementation**

Create `src/lib/utils/barcode.ts`:
```ts
export const normalizeBarcode = (value: string) => value.replace(/\s+/g, '');
export const isValidBarcode = (value: string) => /^\d{6,14}$/.test(value);
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/barcode.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/barcode.ts tests/utils/barcode.test.ts
git commit -m "feat: add barcode utilities"
```

---

## Task 2: Barcode Scanner Component

**Files:**
- Modify: `package.json`
- Create: `src/lib/components/barcode/BarcodeScanner.svelte`
- Create: `src/lib/utils/barcode-scanner.ts`
- Create: `tests/utils/barcode-scanner.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toScannerConfig } from '../../src/lib/utils/barcode-scanner';

describe('toScannerConfig', () => {
	test('returns config with fps', () => {
		const config = toScannerConfig();
		expect(config.fps).toBe(10);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/barcode-scanner.test.ts`
Expected: FAIL with “Cannot find module …/barcode-scanner”

**Step 3: Write minimal implementation**

Run:
```bash
bun add html5-qrcode
```

Create `src/lib/utils/barcode-scanner.ts`:
```ts
export const toScannerConfig = () => ({ fps: 10, qrbox: { width: 250, height: 250 } });
```

Create `src/lib/components/barcode/BarcodeScanner.svelte`:
```svelte
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { toScannerConfig } from '$lib/utils/barcode-scanner';

	export let onScan: (code: string) => void;
	let scanner: any;
	let targetId = `scanner-${Math.random().toString(36).slice(2)}`;

	const start = async () => {
		const { Html5Qrcode } = await import('html5-qrcode');
		scanner = new Html5Qrcode(targetId);
		await scanner.start(
			{ facingMode: 'environment' },
			toScannerConfig(),
			(code: string) => onScan(code)
		);
	};

	start();

	onDestroy(() => {
		scanner?.stop();
	});
</script>

<div class="rounded border p-4">
	<div id={targetId} class="aspect-square w-full" />
</div>
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/barcode-scanner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json bun.lock src/lib/utils/barcode-scanner.ts src/lib/components/barcode/BarcodeScanner.svelte tests/utils/barcode-scanner.test.ts
git commit -m "feat: add barcode scanner component"
```

---

## Task 3: Food Form Barcode Integration

**Files:**
- Modify: `src/lib/components/foods/FoodForm.svelte`
- Create: `tests/utils/barcode-form.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { applyBarcode } from '../../src/lib/utils/barcode-form';

describe('applyBarcode', () => {
	test('applies barcode to form state', () => {
		const form = { barcode: '' };
		applyBarcode(form, '123');
		expect(form.barcode).toBe('123');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/barcode-form.test.ts`
Expected: FAIL with “Cannot find module …/barcode-form”

**Step 3: Write minimal implementation**

Create `src/lib/utils/barcode-form.ts`:
```ts
export const applyBarcode = (form: { barcode?: string }, value: string) => {
	form.barcode = value;
};
```

Modify `src/lib/components/foods/FoodForm.svelte` to include a barcode input and a “Scan Barcode” button that opens `BarcodeScanner` and calls `applyBarcode` on success.

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/barcode-form.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/barcode-form.ts src/lib/components/foods/FoodForm.svelte tests/utils/barcode-form.test.ts
git commit -m "feat: add barcode field to food form"
```

---

## Task 4: Quick-Add Barcode Flow on Dashboard

**Files:**
- Modify: `src/lib/server/foods.ts`
- Modify: `src/routes/api/foods/+server.ts`
- Modify: `src/routes/app/+page.svelte`
- Create: `src/lib/utils/barcode-lookup.ts`
- Create: `tests/utils/barcode-lookup.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toBarcodeLookupUrl } from '../../src/lib/utils/barcode-lookup';

describe('toBarcodeLookupUrl', () => {
	test('builds lookup URL', () => {
		expect(toBarcodeLookupUrl('123')).toBe('/api/foods?barcode=123');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/barcode-lookup.test.ts`
Expected: FAIL with “Cannot find module …/barcode-lookup”

**Step 3: Write minimal implementation**

Create `src/lib/utils/barcode-lookup.ts`:
```ts
export const toBarcodeLookupUrl = (barcode: string) => `/api/foods?barcode=${barcode}`;
```

Update `src/lib/server/foods.ts`:
```ts
export const findFoodByBarcode = async (userId: string, barcode: string) => {
	const [food] = await db.select().from(foods).where(and(eq(foods.userId, userId), eq(foods.barcode, barcode)));
	return food ?? null;
};
```

Update `src/routes/api/foods/+server.ts`:
```ts
import { findFoodByBarcode } from '$lib/server/foods';

export const GET = async ({ locals, url }) => {
	const barcode = url.searchParams.get('barcode');
	if (barcode) {
		const food = await findFoodByBarcode(locals.user.id, barcode);
		return json({ food });
	}
	// existing list handler
};
```

Modify `src/routes/app/+page.svelte` to add a “Scan Barcode” action. When a code is scanned, call `toBarcodeLookupUrl(code)` and either quick-add the found food or navigate to `/app/foods?barcode=...` to prefill the create form.

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/barcode-lookup.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/barcode-lookup.ts src/lib/server/foods.ts src/routes/api/foods/+server.ts src/routes/app/+page.svelte tests/utils/barcode-lookup.test.ts
git commit -m "feat: add barcode quick-add flow"
```
