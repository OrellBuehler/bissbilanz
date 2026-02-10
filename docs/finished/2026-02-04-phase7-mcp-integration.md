# Phase 7: MCP Integration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose MCP tools for AI-assisted logging: status, search, create food/recipe, and log food.

**Architecture:** Implement a single MCP server instance per request, validating session cookies and delegating tool handlers to existing service functions. Keep tool definitions and response formatting in `src/lib/server/mcp`.

**Tech Stack:** SvelteKit 2.x, Svelte 5, Bun, @modelcontextprotocol/sdk

---

## Task 1: MCP Dependency + Server Skeleton

**Files:**
- Modify: `package.json`
- Create: `src/lib/server/mcp/server.ts`
- Create: `tests/utils/mcp.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { createMcpServer } from '../../src/lib/server/mcp/server';

describe('createMcpServer', () => {
	test('creates a server instance', () => {
		const server = createMcpServer();
		expect(server).toBeTruthy();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/mcp.test.ts`
Expected: FAIL with “Cannot find module …/mcp/server”

**Step 3: Write minimal implementation**

Run:
```bash
bun add @modelcontextprotocol/sdk
```

Create `src/lib/server/mcp/server.ts`:
```ts
import { Server } from '@modelcontextprotocol/sdk/server';

export const createMcpServer = () => {
	return new Server({ name: 'bissbilanz', version: '0.1.0' });
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/mcp.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json bun.lock src/lib/server/mcp/server.ts tests/utils/mcp.test.ts
git commit -m "feat: add MCP server skeleton"
```

---

## Task 2: Define MCP Tool Schemas

**Files:**
- Create: `src/lib/server/mcp/tools.ts`
- Create: `tests/utils/mcp-tools.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toolNames } from '../../src/lib/server/mcp/tools';

describe('toolNames', () => {
	test('includes get-daily-status', () => {
		expect(toolNames).toContain('get-daily-status');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/mcp-tools.test.ts`
Expected: FAIL with “Cannot find module …/mcp/tools”

**Step 3: Write minimal implementation**

Create `src/lib/server/mcp/tools.ts`:
```ts
import { z } from 'zod';

export const toolNames = [
	'get-daily-status',
	'create-food',
	'create-recipe',
	'log-food',
	'search-foods'
] as const;

export const createFoodInput = z.object({
	name: z.string(),
	brand: z.string().optional(),
	servingSize: z.number(),
	servingUnit: z.string(),
	calories: z.number(),
	protein: z.number(),
	carbs: z.number(),
	fat: z.number(),
	fiber: z.number(),
	barcode: z.string().optional()
});

export const createRecipeInput = z.object({
	name: z.string(),
	totalServings: z.number(),
	ingredients: z.array(z.object({
		foodId: z.string(),
		quantity: z.number(),
		servingUnit: z.string()
	}))
});

export const logFoodInput = z.object({
	foodId: z.string().optional(),
	recipeId: z.string().optional(),
	mealType: z.string(),
	servings: z.number(),
	notes: z.string().optional(),
	date: z.string().optional()
});

export const searchFoodsInput = z.object({ query: z.string() });
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/mcp-tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/mcp/tools.ts tests/utils/mcp-tools.test.ts
git commit -m "feat: add MCP tool schemas"
```

---

## Task 3: Tool Handlers + Formatting

**Files:**
- Create: `src/lib/server/mcp/handlers.ts`
- Create: `src/lib/server/mcp/format.ts`
- Create: `tests/utils/mcp-format.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { formatDailyStatus } from '../../src/lib/server/mcp/format';

describe('formatDailyStatus', () => {
	test('returns totals and goals', () => {
		const result = formatDailyStatus({ entries: [], goals: { calorieGoal: 2000 } });
		expect(result.totals).toBeTruthy();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/mcp-format.test.ts`
Expected: FAIL with “Cannot find module …/mcp/format”

**Step 3: Write minimal implementation**

Create `src/lib/server/mcp/format.ts`:
```ts
import { calculateDailyTotals } from '$lib/utils/nutrition';

export const formatDailyStatus = ({ entries, goals }: { entries: any[]; goals: any }) => {
	const totals = calculateDailyTotals(entries as any[]);
	return { totals, goals };
};
```

Create `src/lib/server/mcp/handlers.ts`:
```ts
import { createFood, listFoods } from '$lib/server/foods';
import { createRecipe } from '$lib/server/recipes';
import { createEntry, listEntriesByDate } from '$lib/server/entries';
import { getGoals } from '$lib/server/goals';
import { formatDailyStatus } from '$lib/server/mcp/format';

export const handleGetDailyStatus = async (userId: string, date: string) => {
	const entries = await listEntriesByDate(userId, date);
	const goals = await getGoals(userId);
	return formatDailyStatus({ entries, goals });
};

export const handleSearchFoods = async (userId: string, query: string) => {
	const foods = await listFoods(userId, query);
	return { foods };
};

export const handleCreateFood = async (userId: string, payload: unknown) => {
	const food = await createFood(userId, payload);
	return { foodId: food.id, success: true };
};

export const handleCreateRecipe = async (userId: string, payload: unknown) => {
	const recipe = await createRecipe(userId, payload);
	return { recipeId: recipe.id, success: true };
};

export const handleLogFood = async (userId: string, payload: unknown) => {
	const entry = await createEntry(userId, payload);
	return { entryId: entry.id, success: true };
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/mcp-format.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/mcp/format.ts src/lib/server/mcp/handlers.ts tests/utils/mcp-format.test.ts
git commit -m "feat: add MCP tool handlers"
```

---

## Task 4: MCP API Route

**Files:**
- Create: `src/routes/api/mcp/+server.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toolNames } from '../../src/lib/server/mcp/tools';

describe('mcp endpoint tools', () => {
	test('exposes MCP tools', () => {
		expect(toolNames.length).toBeGreaterThan(0);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/mcp-tools.test.ts`
Expected: FAIL with “mcp endpoint not implemented”

**Step 3: Write minimal implementation**

Create `src/routes/api/mcp/+server.ts`:
```ts
import { createMcpServer } from '$lib/server/mcp/server';
import { handleCreateFood, handleCreateRecipe, handleGetDailyStatus, handleLogFood, handleSearchFoods } from '$lib/server/mcp/handlers';
import { toolNames } from '$lib/server/mcp/tools';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';

export const POST = async ({ locals, request }) => {
	const server = createMcpServer();
	const transport = new StreamableHTTPServerTransport();

	server.setTool('get-daily-status', async () => {
		const date = new Date().toISOString().slice(0, 10);
		return handleGetDailyStatus(locals.user.id, date);
	});

	server.setTool('search-foods', async (input: any) => handleSearchFoods(locals.user.id, input.query));
	server.setTool('create-food', async (input: any) => handleCreateFood(locals.user.id, input));
	server.setTool('create-recipe', async (input: any) => handleCreateRecipe(locals.user.id, input));
	server.setTool('log-food', async (input: any) => handleLogFood(locals.user.id, input));

	return transport.handleRequest(request, server, toolNames);
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/mcp-tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/api/mcp/+server.ts
git commit -m "feat: add MCP API endpoint"
```
