# Supplement Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a standalone supplement tracking system with schedules, dashboard checklist, management UI, history view, and MCP tools.

**Architecture:** Two new DB tables (`supplements`, `supplement_logs`) with server-side CRUD + schedule logic. Dashboard shows today's due supplements as a checklist. Dedicated pages for management and history. Two new MCP tools for AI-assisted supplement logging.

**Tech Stack:** SvelteKit, Drizzle ORM, PostgreSQL, Zod, shadcn-svelte, Tailwind CSS, Paraglide i18n, MCP SDK

**Design doc:** `docs/plans/2026-02-17-supplement-tracking-design.md`

---

## Task 1: Database Schema — Enum + Tables

**Files:**
- Create: `src/lib/supplement-units.ts`
- Modify: `src/lib/server/schema.ts`

**Step 1: Create supplement unit values**

Create `src/lib/supplement-units.ts`:

```typescript
export const scheduleTypeValues = ['daily', 'every_other_day', 'weekly', 'specific_days'] as const;
export type ScheduleType = (typeof scheduleTypeValues)[number];

export const dosageUnitValues = ['mg', 'mcg', 'IU', 'g', 'capsules', 'tablets', 'drops', 'ml'] as const;
export type DosageUnit = (typeof dosageUnitValues)[number];
```

**Step 2: Add tables to schema**

Add to `src/lib/server/schema.ts` after the `customMealTypes` table (before OAuth tables):

```typescript
import { scheduleTypeValues } from '../supplement-units';
export type { ScheduleType } from '../supplement-units';
export { scheduleTypeValues } from '../supplement-units';
export const scheduleTypeEnum = pgEnum('schedule_type', scheduleTypeValues);

// Supplements
export const supplements = pgTable(
	'supplements',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		dosage: real('dosage').notNull(),
		dosageUnit: text('dosage_unit').notNull(),
		scheduleType: scheduleTypeEnum('schedule_type').notNull(),
		scheduleDays: integer('schedule_days').array(),
		scheduleStartDate: date('schedule_start_date'),
		isActive: boolean('is_active').notNull().default(true),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_supplements_user_id').on(table.userId),
		index('idx_supplements_user_active').on(table.userId, table.isActive)
	]
);

// Supplement Logs
export const supplementLogs = pgTable(
	'supplement_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		supplementId: uuid('supplement_id')
			.notNull()
			.references(() => supplements.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		date: date('date').notNull(),
		takenAt: timestamp('taken_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		uniqueIndex('idx_supplement_logs_unique').on(table.supplementId, table.date),
		index('idx_supplement_logs_user_date').on(table.userId, table.date),
		index('idx_supplement_logs_supplement_id').on(table.supplementId)
	]
);

// Type exports (add to existing type exports section)
export type Supplement = typeof supplements.$inferSelect;
export type NewSupplement = typeof supplements.$inferInsert;
export type SupplementLog = typeof supplementLogs.$inferSelect;
export type NewSupplementLog = typeof supplementLogs.$inferInsert;
```

**Step 3: Generate and push migration**

Run: `bun run db:generate`
Run: `bun run db:push`

**Step 4: Commit**

```bash
git add src/lib/supplement-units.ts src/lib/server/schema.ts drizzle/
git commit -m "feat: add supplements and supplement_logs schema"
```

---

## Task 2: Validation Schemas

**Files:**
- Create: `src/lib/server/validation/supplements.ts`
- Modify: `src/lib/server/validation/index.ts`

**Step 1: Create validation schemas**

Create `src/lib/server/validation/supplements.ts`:

```typescript
import { z } from 'zod';
import { scheduleTypeValues } from '../../supplement-units';

export const supplementCreateSchema = z
	.object({
		name: z.string().min(1),
		dosage: z.coerce.number().positive(),
		dosageUnit: z.string().min(1),
		scheduleType: z.enum(scheduleTypeValues),
		scheduleDays: z.array(z.coerce.number().int().min(0).max(6)).optional().nullable(),
		scheduleStartDate: z.string().optional().nullable(),
		isActive: z.coerce.boolean().optional(),
		sortOrder: z.coerce.number().int().optional()
	})
	.refine(
		(data) => {
			if (data.scheduleType === 'weekly' || data.scheduleType === 'specific_days') {
				return data.scheduleDays && data.scheduleDays.length > 0;
			}
			return true;
		},
		{ message: 'scheduleDays required for weekly/specific_days schedules', path: ['scheduleDays'] }
	);

export const supplementUpdateSchema = z
	.object({
		name: z.string().min(1).optional(),
		dosage: z.coerce.number().positive().optional(),
		dosageUnit: z.string().min(1).optional(),
		scheduleType: z.enum(scheduleTypeValues).optional(),
		scheduleDays: z.array(z.coerce.number().int().min(0).max(6)).optional().nullable(),
		scheduleStartDate: z.string().optional().nullable(),
		isActive: z.coerce.boolean().optional(),
		sortOrder: z.coerce.number().int().optional()
	});

export const supplementLogSchema = z.object({
	date: z.string().optional() // defaults to today server-side
});
```

**Step 2: Export from barrel**

Add to `src/lib/server/validation/index.ts`:

```typescript
export * from './supplements';
```

**Step 3: Commit**

```bash
git add src/lib/server/validation/supplements.ts src/lib/server/validation/index.ts
git commit -m "feat: add supplement validation schemas"
```

---

## Task 3: Schedule Utility

**Files:**
- Create: `src/lib/utils/supplements.ts`

**Step 1: Write the schedule utility with tests in mind**

Create `src/lib/utils/supplements.ts`:

```typescript
import type { ScheduleType } from '$lib/supplement-units';

/**
 * Determine if a supplement is due on a given date.
 */
export function isSupplementDue(
	scheduleType: ScheduleType,
	scheduleDays: number[] | null,
	scheduleStartDate: string | null,
	date: Date
): boolean {
	switch (scheduleType) {
		case 'daily':
			return true;

		case 'every_other_day': {
			if (!scheduleStartDate) return true;
			const start = new Date(scheduleStartDate);
			const diffMs = date.getTime() - start.getTime();
			const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
			return diffDays % 2 === 0;
		}

		case 'weekly':
		case 'specific_days':
			if (!scheduleDays || scheduleDays.length === 0) return false;
			return scheduleDays.includes(date.getDay());

		default:
			return false;
	}
}

/**
 * Format a schedule into a human-readable summary.
 */
export function formatSchedule(
	scheduleType: ScheduleType,
	scheduleDays: number[] | null
): string {
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	switch (scheduleType) {
		case 'daily':
			return 'Daily';
		case 'every_other_day':
			return 'Every other day';
		case 'weekly':
		case 'specific_days':
			if (!scheduleDays || scheduleDays.length === 0) return 'No days set';
			return scheduleDays.map((d) => dayNames[d]).join(', ');
		default:
			return 'Unknown';
	}
}
```

**Step 2: Commit**

```bash
git add src/lib/utils/supplements.ts
git commit -m "feat: add supplement schedule utilities"
```

---

## Task 4: Schedule Utility Tests

**Files:**
- Create: `tests/utils/supplements.test.ts`

**Step 1: Write tests**

Create `tests/utils/supplements.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { isSupplementDue, formatSchedule } from '$lib/utils/supplements';

describe('isSupplementDue', () => {
	test('daily is always due', () => {
		expect(isSupplementDue('daily', null, null, new Date('2026-02-17'))).toBe(true);
		expect(isSupplementDue('daily', null, null, new Date('2026-02-18'))).toBe(true);
	});

	test('every_other_day: due on even days from start', () => {
		const start = '2026-02-01';
		// Feb 1 = day 0 (even) -> due
		expect(isSupplementDue('every_other_day', null, start, new Date('2026-02-01'))).toBe(true);
		// Feb 2 = day 1 (odd) -> not due
		expect(isSupplementDue('every_other_day', null, start, new Date('2026-02-02'))).toBe(false);
		// Feb 3 = day 2 (even) -> due
		expect(isSupplementDue('every_other_day', null, start, new Date('2026-02-03'))).toBe(true);
	});

	test('every_other_day: defaults to due when no start date', () => {
		expect(isSupplementDue('every_other_day', null, null, new Date('2026-02-17'))).toBe(true);
	});

	test('weekly: due on matching day of week', () => {
		// 2026-02-17 is a Tuesday (day 2)
		expect(isSupplementDue('weekly', [2], null, new Date('2026-02-17'))).toBe(true);
		expect(isSupplementDue('weekly', [1], null, new Date('2026-02-17'))).toBe(false);
	});

	test('specific_days: due on matching days', () => {
		// Mon=1, Wed=3, Fri=5
		expect(isSupplementDue('specific_days', [1, 3, 5], null, new Date('2026-02-17'))).toBe(false); // Tue
		expect(isSupplementDue('specific_days', [1, 3, 5], null, new Date('2026-02-18'))).toBe(false); // Wed? Let me check...
		// 2026-02-18 is Wednesday (day 3)
		expect(isSupplementDue('specific_days', [1, 3, 5], null, new Date('2026-02-18'))).toBe(true);
	});

	test('specific_days: not due when no days set', () => {
		expect(isSupplementDue('specific_days', [], null, new Date('2026-02-17'))).toBe(false);
		expect(isSupplementDue('specific_days', null, null, new Date('2026-02-17'))).toBe(false);
	});
});

describe('formatSchedule', () => {
	test('daily', () => {
		expect(formatSchedule('daily', null)).toBe('Daily');
	});

	test('every_other_day', () => {
		expect(formatSchedule('every_other_day', null)).toBe('Every other day');
	});

	test('specific_days', () => {
		expect(formatSchedule('specific_days', [1, 3, 5])).toBe('Mon, Wed, Fri');
	});

	test('weekly with no days', () => {
		expect(formatSchedule('weekly', [])).toBe('No days set');
	});
});
```

**Step 2: Run tests**

Run: `bun test tests/utils/supplements.test.ts`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add tests/utils/supplements.test.ts
git commit -m "test: add supplement schedule utility tests"
```

---

## Task 5: Server DB Module

**Files:**
- Create: `src/lib/server/supplements.ts`

**Step 1: Create the supplements server module**

Create `src/lib/server/supplements.ts`:

```typescript
import { getDB } from '$lib/server/db';
import { supplements, supplementLogs } from '$lib/server/schema';
import { supplementCreateSchema, supplementUpdateSchema } from '$lib/server/validation';
import { and, eq, desc } from 'drizzle-orm';
import { gte, lte } from 'drizzle-orm';
import type { ZodError } from 'zod';
import { today } from '$lib/utils/dates';

type SuccessResult<T> = { success: true; data: T };
type ErrorResult = { success: false; error: ZodError | Error };
type Result<T> = SuccessResult<T> | ErrorResult;

export const listSupplements = async (userId: string, activeOnly = true) => {
	const db = getDB();
	const where = activeOnly
		? and(eq(supplements.userId, userId), eq(supplements.isActive, true))
		: eq(supplements.userId, userId);

	return db
		.select()
		.from(supplements)
		.where(where)
		.orderBy(supplements.sortOrder, supplements.name);
};

export const getSupplementById = async (userId: string, id: string) => {
	const db = getDB();
	const [supplement] = await db
		.select()
		.from(supplements)
		.where(and(eq(supplements.id, id), eq(supplements.userId, userId)));
	return supplement ?? null;
};

export const createSupplement = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof supplements.$inferSelect>> => {
	const result = supplementCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const data = result.data;
		const [created] = await db
			.insert(supplements)
			.values({
				userId,
				name: data.name,
				dosage: data.dosage,
				dosageUnit: data.dosageUnit,
				scheduleType: data.scheduleType,
				scheduleDays: data.scheduleDays ?? null,
				scheduleStartDate: data.scheduleStartDate ?? today(),
				isActive: data.isActive ?? true,
				sortOrder: data.sortOrder ?? 0
			})
			.returning();

		if (!created) {
			return { success: false, error: new Error('Failed to create supplement') };
		}
		return { success: true, data: created };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const updateSupplement = async (
	userId: string,
	id: string,
	payload: unknown
): Promise<Result<typeof supplements.$inferSelect | undefined>> => {
	const result = supplementUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const [updated] = await db
			.update(supplements)
			.set({ ...result.data, updatedAt: new Date() })
			.where(and(eq(supplements.id, id), eq(supplements.userId, userId)))
			.returning();
		return { success: true, data: updated };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const deleteSupplement = async (userId: string, id: string) => {
	const db = getDB();
	await db
		.delete(supplements)
		.where(and(eq(supplements.id, id), eq(supplements.userId, userId)));
};

export const logSupplement = async (
	userId: string,
	supplementId: string,
	date: string
): Promise<Result<typeof supplementLogs.$inferSelect>> => {
	try {
		const db = getDB();

		// Verify supplement belongs to user
		const supplement = await getSupplementById(userId, supplementId);
		if (!supplement) {
			return { success: false, error: new Error('Supplement not found') };
		}

		const [log] = await db
			.insert(supplementLogs)
			.values({
				supplementId,
				userId,
				date,
				takenAt: new Date()
			})
			.onConflictDoNothing()
			.returning();

		if (!log) {
			// Already logged today — fetch existing
			const [existing] = await db
				.select()
				.from(supplementLogs)
				.where(
					and(eq(supplementLogs.supplementId, supplementId), eq(supplementLogs.date, date))
				);
			if (existing) {
				return { success: true, data: existing };
			}
			return { success: false, error: new Error('Failed to log supplement') };
		}

		return { success: true, data: log };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const unlogSupplement = async (userId: string, supplementId: string, date: string) => {
	const db = getDB();
	await db
		.delete(supplementLogs)
		.where(
			and(
				eq(supplementLogs.supplementId, supplementId),
				eq(supplementLogs.userId, userId),
				eq(supplementLogs.date, date)
			)
		);
};

export const getLogsForDate = async (userId: string, date: string) => {
	const db = getDB();
	return db
		.select()
		.from(supplementLogs)
		.where(and(eq(supplementLogs.userId, userId), eq(supplementLogs.date, date)));
};

export const getLogsForRange = async (userId: string, from: string, to: string) => {
	const db = getDB();
	return db
		.select({
			log: supplementLogs,
			supplementName: supplements.name,
			dosage: supplements.dosage,
			dosageUnit: supplements.dosageUnit
		})
		.from(supplementLogs)
		.innerJoin(supplements, eq(supplementLogs.supplementId, supplements.id))
		.where(
			and(
				eq(supplementLogs.userId, userId),
				gte(supplementLogs.date, from),
				lte(supplementLogs.date, to)
			)
		)
		.orderBy(desc(supplementLogs.date), supplements.name);
};
```

**Step 2: Commit**

```bash
git add src/lib/server/supplements.ts
git commit -m "feat: add supplements server module"
```

---

## Task 6: Server DB Module Tests

**Files:**
- Create: `tests/server/supplements-db.test.ts`
- Modify: `tests/helpers/fixtures.ts`

**Step 1: Add test fixtures**

Add to `tests/helpers/fixtures.ts`:

```typescript
export const TEST_SUPPLEMENT = {
	id: '10000000-0000-4000-8000-000000000030',
	userId: TEST_USER.id,
	name: 'Vitamin D3',
	dosage: 1000,
	dosageUnit: 'IU',
	scheduleType: 'daily' as const,
	scheduleDays: null,
	scheduleStartDate: '2026-02-01',
	isActive: true,
	sortOrder: 0,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-01T00:00:00Z')
};

export const TEST_SUPPLEMENT_LOG = {
	id: '10000000-0000-4000-8000-000000000031',
	supplementId: TEST_SUPPLEMENT.id,
	userId: TEST_USER.id,
	date: '2026-02-17',
	takenAt: new Date('2026-02-17T08:00:00Z'),
	createdAt: new Date('2026-02-17T08:00:00Z')
};

export const VALID_SUPPLEMENT_PAYLOAD = {
	name: 'Vitamin D3',
	dosage: 1000,
	dosageUnit: 'IU',
	scheduleType: 'daily'
};
```

**Step 2: Create tests**

Create `tests/server/supplements-db.test.ts`:

```typescript
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_SUPPLEMENT, TEST_SUPPLEMENT_LOG, VALID_SUPPLEMENT_PAYLOAD } from '../helpers/fixtures';

const { db, setResult, reset } = createMockDB();

mock.module('$lib/server/db', () => ({
	getDB: () => db
}));

const {
	listSupplements,
	createSupplement,
	updateSupplement,
	deleteSupplement,
	logSupplement,
	unlogSupplement,
	getLogsForDate
} = await import('$lib/server/supplements');

describe('supplements-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('listSupplements', () => {
		test('returns active supplements for user', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await listSupplements(TEST_USER.id);
			expect(result).toEqual([TEST_SUPPLEMENT]);
		});

		test('returns all supplements when activeOnly is false', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await listSupplements(TEST_USER.id, false);
			expect(result).toEqual([TEST_SUPPLEMENT]);
		});
	});

	describe('createSupplement', () => {
		test('creates supplement with valid payload', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await createSupplement(TEST_USER.id, VALID_SUPPLEMENT_PAYLOAD);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe('Vitamin D3');
			}
		});

		test('returns validation error for missing name', async () => {
			const result = await createSupplement(TEST_USER.id, { dosage: 1000 });
			expect(result.success).toBe(false);
		});

		test('requires scheduleDays for specific_days type', async () => {
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				scheduleType: 'specific_days'
				// missing scheduleDays
			});
			expect(result.success).toBe(false);
		});
	});

	describe('updateSupplement', () => {
		test('updates supplement', async () => {
			const updated = { ...TEST_SUPPLEMENT, dosage: 2000 };
			setResult([updated]);
			const result = await updateSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, { dosage: 2000 });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.dosage).toBe(2000);
			}
		});
	});

	describe('deleteSupplement', () => {
		test('deletes supplement', async () => {
			setResult(undefined);
			await deleteSupplement(TEST_USER.id, TEST_SUPPLEMENT.id);
		});
	});

	describe('logSupplement', () => {
		test('logs supplement as taken', async () => {
			// First setResult for getSupplementById, second for insert
			setResult([TEST_SUPPLEMENT]);
			setResult([TEST_SUPPLEMENT_LOG]);
			const result = await logSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, '2026-02-17');
			expect(result.success).toBe(true);
		});
	});

	describe('getLogsForDate', () => {
		test('returns logs for a date', async () => {
			setResult([TEST_SUPPLEMENT_LOG]);
			const result = await getLogsForDate(TEST_USER.id, '2026-02-17');
			expect(result).toEqual([TEST_SUPPLEMENT_LOG]);
		});
	});
});
```

**Step 3: Run tests**

Run: `bun test tests/server/supplements-db.test.ts`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add tests/server/supplements-db.test.ts tests/helpers/fixtures.ts
git commit -m "test: add supplements DB module tests"
```

---

## Task 7: API Routes — Supplement CRUD

**Files:**
- Create: `src/routes/api/supplements/+server.ts`
- Create: `src/routes/api/supplements/[id]/+server.ts`

**Step 1: Create main supplements endpoint**

Create `src/routes/api/supplements/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSupplements, createSupplement } from '$lib/server/supplements';
import { handleApiError, requireAuth, isZodError, validationError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const all = url.searchParams.get('all') === 'true';
		const supplements = await listSupplements(userId, !all);
		return json({ supplements });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();
		const result = await createSupplement(userId, body);

		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		return json({ supplement: result.data }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
```

**Step 2: Create single supplement endpoint**

Create `src/routes/api/supplements/[id]/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getSupplementById,
	updateSupplement,
	deleteSupplement
} from '$lib/server/supplements';
import { handleApiError, requireAuth, isZodError, validationError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const supplement = await getSupplementById(userId, params.id);
		if (!supplement) {
			return json({ error: 'Supplement not found' }, { status: 404 });
		}
		return json({ supplement });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();
		const result = await updateSupplement(userId, params.id, body);

		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		if (!result.data) {
			return json({ error: 'Supplement not found' }, { status: 404 });
		}

		return json({ supplement: result.data });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		await deleteSupplement(userId, params.id);
		return json({ success: true });
	} catch (error) {
		return handleApiError(error);
	}
};
```

**Step 3: Commit**

```bash
git add src/routes/api/supplements/
git commit -m "feat: add supplement CRUD API endpoints"
```

---

## Task 8: API Routes — Supplement Logs

**Files:**
- Create: `src/routes/api/supplements/today/+server.ts`
- Create: `src/routes/api/supplements/[id]/log/+server.ts`
- Create: `src/routes/api/supplements/[id]/log/[date]/+server.ts`
- Create: `src/routes/api/supplements/history/+server.ts`

**Step 1: Today's checklist endpoint**

Create `src/routes/api/supplements/today/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSupplements, getLogsForDate } from '$lib/server/supplements';
import { isSupplementDue } from '$lib/utils/supplements';
import { today } from '$lib/utils/dates';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const currentDate = today();
		const now = new Date();

		const [allSupplements, logs] = await Promise.all([
			listSupplements(userId, true),
			getLogsForDate(userId, currentDate)
		]);

		const logMap = new Map(logs.map((l) => [l.supplementId, l]));

		const checklist = allSupplements
			.filter((s) =>
				isSupplementDue(s.scheduleType, s.scheduleDays, s.scheduleStartDate, now)
			)
			.map((s) => ({
				supplement: s,
				taken: logMap.has(s.id),
				takenAt: logMap.get(s.id)?.takenAt ?? null
			}));

		return json({ checklist, date: currentDate });
	} catch (error) {
		return handleApiError(error);
	}
};
```

**Step 2: Log/unlog endpoint**

Create `src/routes/api/supplements/[id]/log/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logSupplement } from '$lib/server/supplements';
import { supplementLogSchema } from '$lib/server/validation';
import { today } from '$lib/utils/dates';
import { handleApiError, requireAuth, validationError } from '$lib/server/errors';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json().catch(() => ({}));

		const parsed = supplementLogSchema.safeParse(body);
		if (!parsed.success) {
			return validationError(parsed.error);
		}

		const date = parsed.data.date ?? today();
		const result = await logSupplement(userId, params.id, date);

		if (!result.success) {
			if (result.error.message === 'Supplement not found') {
				return json({ error: 'Supplement not found' }, { status: 404 });
			}
			throw result.error;
		}

		return json({ log: result.data }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
```

**Step 3: Unlog by date endpoint**

Create `src/routes/api/supplements/[id]/log/[date]/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { unlogSupplement } from '$lib/server/supplements';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		await unlogSupplement(userId, params.id, params.date);
		return json({ success: true });
	} catch (error) {
		return handleApiError(error);
	}
};
```

**Step 4: History endpoint**

Create `src/routes/api/supplements/history/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLogsForRange } from '$lib/server/supplements';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');

		if (!from || !to) {
			return json({ error: 'from and to query parameters are required' }, { status: 400 });
		}

		const history = await getLogsForRange(userId, from, to);
		return json({ history });
	} catch (error) {
		return handleApiError(error);
	}
};
```

**Step 5: Commit**

```bash
git add src/routes/api/supplements/
git commit -m "feat: add supplement log API endpoints (today, log, unlog, history)"
```

---

## Task 9: i18n Messages

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/de.json`

**Step 1: Add English messages**

Add to `messages/en.json`:

```json
"nav_supplements": "Supplements",

"supplements_title": "Supplements",
"supplements_add": "Add Supplement",
"supplements_empty": "No supplements yet",
"supplements_name": "Name",
"supplements_dosage": "Dosage",
"supplements_unit": "Unit",
"supplements_schedule": "Schedule",
"supplements_schedule_daily": "Daily",
"supplements_schedule_every_other_day": "Every other day",
"supplements_schedule_weekly": "Weekly",
"supplements_schedule_specific_days": "Specific days",
"supplements_start_date": "Start date",
"supplements_days": "Days",
"supplements_active": "Active",
"supplements_inactive": "Inactive",
"supplements_save": "Save",
"supplements_cancel": "Cancel",
"supplements_delete": "Delete",
"supplements_delete_confirm": "Delete this supplement? History will be lost.",
"supplements_edit": "Edit Supplement",
"supplements_taken": "Taken",
"supplements_pending": "Pending",

"supplements_day_sun": "Sun",
"supplements_day_mon": "Mon",
"supplements_day_tue": "Tue",
"supplements_day_wed": "Wed",
"supplements_day_thu": "Thu",
"supplements_day_fri": "Fri",
"supplements_day_sat": "Sat",

"supplements_history_title": "Supplement History",
"supplements_history_empty": "No supplement history for this period",

"dashboard_supplements": "Supplements",
"dashboard_supplements_all_taken": "All taken!",
"dashboard_supplements_progress": "{taken} / {total} taken"
```

**Step 2: Add German messages**

Add to `messages/de.json`:

```json
"nav_supplements": "Supplemente",

"supplements_title": "Supplemente",
"supplements_add": "Supplement hinzufügen",
"supplements_empty": "Noch keine Supplemente",
"supplements_name": "Name",
"supplements_dosage": "Dosierung",
"supplements_unit": "Einheit",
"supplements_schedule": "Zeitplan",
"supplements_schedule_daily": "Täglich",
"supplements_schedule_every_other_day": "Jeden zweiten Tag",
"supplements_schedule_weekly": "Wöchentlich",
"supplements_schedule_specific_days": "Bestimmte Tage",
"supplements_start_date": "Startdatum",
"supplements_days": "Tage",
"supplements_active": "Aktiv",
"supplements_inactive": "Inaktiv",
"supplements_save": "Speichern",
"supplements_cancel": "Abbrechen",
"supplements_delete": "Löschen",
"supplements_delete_confirm": "Dieses Supplement löschen? Der Verlauf geht verloren.",
"supplements_edit": "Supplement bearbeiten",
"supplements_taken": "Genommen",
"supplements_pending": "Ausstehend",

"supplements_day_sun": "So",
"supplements_day_mon": "Mo",
"supplements_day_tue": "Di",
"supplements_day_wed": "Mi",
"supplements_day_thu": "Do",
"supplements_day_fri": "Fr",
"supplements_day_sat": "Sa",

"supplements_history_title": "Supplement-Verlauf",
"supplements_history_empty": "Kein Supplement-Verlauf für diesen Zeitraum",

"dashboard_supplements": "Supplemente",
"dashboard_supplements_all_taken": "Alle genommen!",
"dashboard_supplements_progress": "{taken} / {total} genommen"
```

**Step 3: Run dev briefly to regenerate paraglide**

Run: `bun run dev` (then Ctrl+C after a few seconds)

**Step 4: Commit**

```bash
git add messages/en.json messages/de.json
git commit -m "feat: add supplement tracking i18n messages (en, de)"
```

---

## Task 10: Navigation Update

**Files:**
- Modify: `src/lib/config/navigation.ts`

**Step 1: Add supplements nav item**

Add `Pill` icon import and nav item after recipes, before goals:

```typescript
import Pill from '@lucide/svelte/icons/pill';
```

Add to the nav items array (after recipes, before goals):

```typescript
{ title: () => m.nav_supplements(), href: '/app/supplements', icon: Pill },
```

**Step 2: Commit**

```bash
git add src/lib/config/navigation.ts
git commit -m "feat: add supplements to navigation"
```

---

## Task 11: Dashboard Supplements Card

**Files:**
- Create: `src/lib/components/supplements/SupplementChecklist.svelte`
- Modify: `src/routes/app/+page.svelte`

**Step 1: Create the checklist component**

Create `src/lib/components/supplements/SupplementChecklist.svelte`:

```svelte
<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Pill from '@lucide/svelte/icons/pill';
	import * as m from '$lib/paraglide/messages';

	type ChecklistItem = {
		supplement: {
			id: string;
			name: string;
			dosage: number;
			dosageUnit: string;
		};
		taken: boolean;
		takenAt: string | null;
	};

	let { checklist = [], onToggle }: {
		checklist: ChecklistItem[];
		onToggle: (supplementId: string, taken: boolean) => void;
	} = $props();

	const takenCount = $derived(checklist.filter((c) => c.taken).length);
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-center justify-between pb-2">
		<div class="flex items-center gap-2">
			<Pill class="h-5 w-5" />
			<Card.Title class="text-base">{m.dashboard_supplements()}</Card.Title>
		</div>
		{#if checklist.length > 0}
			<span class="text-muted-foreground text-sm">
				{#if takenCount === checklist.length}
					{m.dashboard_supplements_all_taken()}
				{:else}
					{m.dashboard_supplements_progress({ taken: takenCount, total: checklist.length })}
				{/if}
			</span>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if checklist.length === 0}
			<p class="text-muted-foreground text-sm">{m.supplements_empty()}</p>
		{:else}
			<div class="space-y-2">
				{#each checklist as item (item.supplement.id)}
					<label class="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer">
						<Checkbox
							checked={item.taken}
							onCheckedChange={(checked) => onToggle(item.supplement.id, !!checked)}
						/>
						<span class={item.taken ? 'line-through text-muted-foreground' : ''}>
							{item.supplement.name}
						</span>
						<span class="text-muted-foreground text-sm ml-auto">
							{item.supplement.dosage} {item.supplement.dosageUnit}
						</span>
					</label>
				{/each}
			</div>
		{/if}
		<div class="mt-3 pt-3 border-t">
			<Button variant="ghost" size="sm" href="/app/supplements" class="w-full">
				{m.supplements_title()}
			</Button>
		</div>
	</Card.Content>
</Card.Root>
```

**Step 2: Integrate into dashboard**

Add to `src/routes/app/+page.svelte`:

Import:
```typescript
import SupplementChecklist from '$lib/components/supplements/SupplementChecklist.svelte';
```

Add state:
```typescript
let supplementChecklist: Array<any> = $state([]);

const loadSupplements = async () => {
	try {
		const res = await fetch('/api/supplements/today');
		if (res.ok) {
			supplementChecklist = (await res.json()).checklist;
		}
	} catch {
		// silently ignore
	}
};

const toggleSupplement = async (supplementId: string, taken: boolean) => {
	if (taken) {
		await fetch(`/api/supplements/${supplementId}/log`, { method: 'POST', body: '{}' });
	} else {
		const currentDate = today();
		await fetch(`/api/supplements/${supplementId}/log/${currentDate}`, { method: 'DELETE' });
	}
	await loadSupplements();
};
```

Call `loadSupplements()` in `onMount` alongside existing `loadData()`.

Add the component in the template after the weekly chart card, before the meal sections grid:

```svelte
{#if supplementChecklist.length > 0}
	<SupplementChecklist checklist={supplementChecklist} onToggle={toggleSupplement} />
{/if}
```

**Step 3: Commit**

```bash
git add src/lib/components/supplements/ src/routes/app/+page.svelte
git commit -m "feat: add supplement checklist to dashboard"
```

---

## Task 12: Supplements Management Page

**Files:**
- Create: `src/routes/app/supplements/+page.svelte`
- Create: `src/lib/components/supplements/SupplementForm.svelte`

**Step 1: Create the supplement form component**

Create `src/lib/components/supplements/SupplementForm.svelte`:

A modal form with fields for name, dosage, unit (select), schedule type (radio), day picker (conditional), start date (conditional). Uses shadcn-svelte `Dialog`, `Input`, `Select`, `Button`. Calls `onSave` callback with the payload. Handles both create and edit modes via an optional `supplement` prop.

**Step 2: Create the supplements management page**

Create `src/routes/app/supplements/+page.svelte`:

Lists all supplements with name, dosage, schedule summary. Each row has edit/delete actions and an active toggle. "Add Supplement" button opens the form modal. Fetches from `/api/supplements?all=true`. Uses shadcn-svelte `Card`, `Switch`, `Button` components.

**Step 3: Commit**

```bash
git add src/routes/app/supplements/ src/lib/components/supplements/SupplementForm.svelte
git commit -m "feat: add supplements management page with form"
```

---

## Task 13: Supplements History Page

**Files:**
- Create: `src/routes/app/supplements/history/+page.svelte`

**Step 1: Create the history page**

A page that shows supplement logs in a table format. Date range picker (default: last 30 days). Fetches from `/api/supplements/history?from=&to=`. Displays date rows with supplement names and checkmarks. Uses shadcn-svelte `Card`, `Table` components.

**Step 2: Commit**

```bash
git add src/routes/app/supplements/history/
git commit -m "feat: add supplements history page"
```

---

## Task 14: MCP Tools

**Files:**
- Modify: `src/lib/server/mcp/tools.ts`
- Modify: `src/lib/server/mcp/server.ts`

**Step 1: Add tool schemas**

Add to `src/lib/server/mcp/tools.ts`:

```typescript
export const toolNames = [
	// ... existing tools ...
	'get-supplement-status',
	'log-supplement'
] as const;

export const logSupplementInput = z.object({
	name: z.string().optional().describe('Supplement name to search for'),
	supplementId: z.string().optional().describe('Exact supplement ID'),
	date: z.string().optional().describe('Date in YYYY-MM-DD format, defaults to today')
});
```

**Step 2: Register tools in server**

Add to `src/lib/server/mcp/server.ts`:

Register `get-supplement-status`:
- No input needed
- Calls `listSupplements()` + `getLogsForDate()` + `isSupplementDue()`
- Returns today's checklist with taken/pending status

Register `log-supplement`:
- Input: name (fuzzy search) or supplementId, optional date
- If name provided, search supplements and find best match
- Calls `logSupplement()`
- Returns confirmation

**Step 3: Commit**

```bash
git add src/lib/server/mcp/tools.ts src/lib/server/mcp/server.ts
git commit -m "feat: add MCP tools for supplement tracking"
```

---

## Task 15: Type Check and Final Verification

**Step 1: Run type checker**

Run: `bun run check`
Fix any type errors.

**Step 2: Run all tests**

Run: `bun test`
Expected: All new + existing tests pass.

**Step 3: Manual verification**

Run: `bun run dev`
- Verify nav shows "Supplements"
- Create a supplement via `/app/supplements`
- Verify it appears on dashboard checklist
- Check/uncheck it
- Verify history page shows the log

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: supplement tracking type/lint fixes"
```

---

## Task Dependency Order

```
Task 1 (Schema) → Task 2 (Validation) → Task 3 (Utils) → Task 4 (Utils Tests)
                                        ↓
Task 5 (Server Module) → Task 6 (Server Tests)
                        ↓
Task 7 (CRUD API) → Task 8 (Log API)
                    ↓
Task 9 (i18n) → Task 10 (Nav) → Task 11 (Dashboard Card) → Task 12 (Management Page) → Task 13 (History Page)
                                                            ↓
Task 14 (MCP Tools)
                    ↓
Task 15 (Verification)
```
