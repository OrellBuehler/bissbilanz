# Phase 1: Foundation - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up SvelteKit project with Bun runtime, Infomaniak OIDC authentication, PostgreSQL database with Drizzle ORM, and basic authenticated layout.

**Architecture:** Copy authentication patterns from reference project (`/home/orell/github/wohnungs-plan`), adapt for Bissbilanz. Use session-based auth with HttpOnly cookies, Drizzle schema for users/sessions, and protected routes via hooks.

**Tech Stack:** SvelteKit 2.x, Svelte 5, Bun, Drizzle ORM, PostgreSQL, Infomaniak OIDC, shadcn-svelte, Tailwind CSS 4.x

---

## Task 1: Initialize SvelteKit Project

**Files:**
- Create: `package.json`
- Create: `svelte.config.js`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`

**Step 1: Initialize Bun project**

Run from `/home/orell/github/bissbilanz`:
```bash
bun create svelte@latest . --template skeleton --types typescript
```

When prompted:
- Template: Skeleton project
- Type checking: TypeScript
- Additional options: Prettier (yes), ESLint (no), Playwright (no), Vitest (no)

Expected: Creates basic SvelteKit structure

**Step 2: Install core dependencies**

Run:
```bash
bun add drizzle-orm postgres
bun add -d drizzle-kit @types/node @types/bun svelte-adapter-bun
```

Expected: Dependencies added to `package.json`

**Step 3: Configure Bun adapter**

Modify `svelte.config.js`:
```javascript
import adapter from 'svelte-adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
	}
};

export default config;
```

**Step 4: Update package.json scripts**

Modify `package.json`:
```json
{
	"scripts": {
		"dev": "bun --bun vite dev",
		"build": "bun --bun vite build",
		"preview": "bun --bun vite preview",
		"prepare": "svelte-kit sync || echo ''",
		"check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
		"check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
		"db:generate": "drizzle-kit generate",
		"db:migrate": "drizzle-kit migrate",
		"db:push": "drizzle-kit push",
		"db:studio": "drizzle-kit studio"
	}
}
```

**Step 5: Create .env.example**

Create `.env.example`:
```bash
# Infomaniak OIDC
INFOMANIAK_CLIENT_ID=
INFOMANIAK_CLIENT_SECRET=
INFOMANIAK_REDIRECT_URI=http://localhost:5173/api/auth/callback

# Database
DATABASE_URL=postgres://user:password@localhost:5432/bissbilanz

# Session
SESSION_SECRET=generate-random-32-byte-string

# App
PUBLIC_APP_URL=http://localhost:5173

# MCP (optional)
MCP_ENDPOINT_ENABLED=false
```

**Step 6: Update .gitignore**

Add to `.gitignore`:
```
.env
drizzle/
uploads/
```

**Step 7: Commit**

Run:
```bash
git add .
git commit -m "feat: initialize SvelteKit project with Bun"
```

---

## Task 2: Install UI Dependencies

**Files:**
- Modify: `package.json`
- Create: `tailwind.config.ts`
- Create: `src/app.css`

**Step 1: Install Tailwind CSS and shadcn-svelte dependencies**

Run:
```bash
bun add -d tailwindcss @tailwindcss/vite tailwind-variants tailwind-merge clsx
bun add -d bits-ui lucide-svelte
```

**Step 2: Initialize Tailwind**

Create `tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {}
	},
	plugins: []
} satisfies Config;
```

**Step 3: Configure Vite for Tailwind**

Modify `vite.config.ts`:
```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()]
});
```

**Step 4: Create app.css**

Create `src/app.css`:
```css
@import 'tailwindcss';
```

**Step 5: Import styles in layout**

Create `src/routes/+layout.svelte`:
```svelte
<script lang="ts">
	import '../app.css';
</script>

<slot />
```

**Step 6: Test dev server**

Run:
```bash
bun run dev
```

Expected: Dev server starts at http://localhost:5173
Visit in browser: Should see default SvelteKit page with Tailwind styles

**Step 7: Commit**

Run:
```bash
git add .
git commit -m "feat: add Tailwind CSS and UI dependencies"
```

---

## Task 3: Configure Drizzle and Database Schema

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/lib/server/env.ts`
- Create: `src/lib/server/schema.ts`
- Create: `src/lib/server/db.ts`

**Step 1: Create environment config**

Create `src/lib/server/env.ts`:
```typescript
export const config = {
	database: {
		url: process.env.DATABASE_URL!
	},
	infomaniak: {
		clientId: process.env.INFOMANIAK_CLIENT_ID!,
		clientSecret: process.env.INFOMANIAK_CLIENT_SECRET!,
		redirectUri: process.env.INFOMANIAK_REDIRECT_URI!
	},
	session: {
		secret: process.env.SESSION_SECRET!
	},
	app: {
		url: process.env.PUBLIC_APP_URL!
	}
};
```

**Step 2: Create database schema**

Create `src/lib/server/schema.ts`:
```typescript
import {
	pgTable,
	uuid,
	text,
	timestamp,
	real,
	boolean,
	integer,
	date,
	index,
	primaryKey
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Users (from Infomaniak OIDC)
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	infomaniakSub: text('infomaniak_sub').unique().notNull(),
	email: text('email'),
	name: text('name'),
	avatarUrl: text('avatar_url'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

// Sessions
export const sessions = pgTable(
	'sessions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		refreshToken: text('refresh_token'),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_sessions_user_id').on(table.userId),
		index('idx_sessions_expires_at').on(table.expiresAt)
	]
);

// Foods (user-created database)
export const foods = pgTable(
	'foods',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		brand: text('brand'),
		servingSize: real('serving_size').notNull(),
		servingUnit: text('serving_unit').notNull(),
		calories: real('calories').notNull(),
		protein: real('protein').notNull(),
		carbs: real('carbs').notNull(),
		fat: real('fat').notNull(),
		fiber: real('fiber').notNull(),
		barcode: text('barcode').unique(),
		isFavorite: boolean('is_favorite').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [index('idx_foods_user_id').on(table.userId), index('idx_foods_barcode').on(table.barcode)]
);

// Food Entries (daily log)
export const foodEntries = pgTable(
	'food_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
		recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
		date: date('date').notNull(),
		mealType: text('meal_type').notNull(),
		servings: real('servings').notNull(),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_food_entries_user_date').on(table.userId, table.date),
		index('idx_food_entries_food_id').on(table.foodId),
		index('idx_food_entries_recipe_id').on(table.recipeId)
	]
);

// User Goals
export const userGoals = pgTable('user_goals', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	calorieGoal: real('calorie_goal').notNull(),
	proteinGoal: real('protein_goal').notNull(),
	carbGoal: real('carb_goal').notNull(),
	fatGoal: real('fat_goal').notNull(),
	fiberGoal: real('fiber_goal').notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

// Recipes
export const recipes = pgTable(
	'recipes',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		totalServings: real('total_servings').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [index('idx_recipes_user_id').on(table.userId)]
);

// Recipe Ingredients
export const recipeIngredients = pgTable(
	'recipe_ingredients',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		recipeId: uuid('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		foodId: uuid('food_id')
			.notNull()
			.references(() => foods.id, { onDelete: 'cascade' }),
		quantity: real('quantity').notNull(),
		servingUnit: text('serving_unit').notNull(),
		sortOrder: integer('sort_order').notNull()
	},
	(table) => [
		index('idx_recipe_ingredients_recipe_id').on(table.recipeId),
		index('idx_recipe_ingredients_food_id').on(table.foodId)
	]
);

// Custom Meal Types
export const customMealTypes = pgTable(
	'custom_meal_types',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => [index('idx_custom_meal_types_user_id').on(table.userId)]
);

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Food = typeof foods.$inferSelect;
export type NewFood = typeof foods.$inferInsert;
export type FoodEntry = typeof foodEntries.$inferSelect;
export type NewFoodEntry = typeof foodEntries.$inferInsert;
export type UserGoal = typeof userGoals.$inferSelect;
export type NewUserGoal = typeof userGoals.$inferInsert;
export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert;
export type CustomMealType = typeof customMealTypes.$inferSelect;
export type NewCustomMealType = typeof customMealTypes.$inferInsert;
```

**Step 3: Create database connection**

Create `src/lib/server/db.ts`:
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from './env';
import * as schema from './schema';

let db: ReturnType<typeof drizzle> | null = null;

export function getDB() {
	if (!db) {
		const client = postgres(config.database.url);
		db = drizzle(client, { schema });
	}
	return db;
}

// Re-export schema for convenience
export * from './schema';
```

**Step 4: Configure Drizzle Kit**

Create `drizzle.config.ts`:
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	out: './drizzle',
	schema: './src/lib/server/schema.ts',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL!
	}
});
```

**Step 5: Create local .env file**

Create `.env` (not committed):
```bash
INFOMANIAK_CLIENT_ID=your-client-id
INFOMANIAK_CLIENT_SECRET=your-client-secret
INFOMANIAK_REDIRECT_URI=http://localhost:5173/api/auth/callback

DATABASE_URL=postgres://postgres:postgres@localhost:5432/bissbilanz

SESSION_SECRET=your-random-32-byte-secret-here

PUBLIC_APP_URL=http://localhost:5173

MCP_ENDPOINT_ENABLED=false
```

**Step 6: Generate and push schema**

Run (requires PostgreSQL running):
```bash
bun run db:push
```

Expected: Tables created in database

**Step 7: Commit**

Run:
```bash
git add drizzle.config.ts src/lib/server/
git commit -m "feat: configure Drizzle ORM and database schema"
```

---

## Task 4: Implement Session Management

**Files:**
- Create: `src/lib/server/session.ts`
- Create: `src/lib/server/types.ts`

**Step 1: Create types file**

Create `src/lib/server/types.ts`:
```typescript
export interface UserProfile {
	id: string;
	email: string | null;
	name: string | null;
	avatarUrl: string | null;
}
```

**Step 2: Create session utilities**

Create `src/lib/server/session.ts`:
```typescript
import { eq, lt } from 'drizzle-orm';
import { getDB, sessions, users, type Session, type User } from './db';
import { config } from './env';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateSessionId(): string {
	return crypto.randomUUID();
}

export async function createSession(userId: string, refreshToken?: string): Promise<Session> {
	const db = getDB();
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

	const [session] = await db
		.insert(sessions)
		.values({
			userId,
			refreshToken: refreshToken ?? null,
			expiresAt
		})
		.returning();

	return session;
}

export async function getSession(sessionId: string): Promise<Session | null> {
	const db = getDB();
	const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));

	if (!session || session.expiresAt < new Date()) {
		return null;
	}

	return session;
}

export async function getSessionWithUser(
	sessionId: string
): Promise<{ session: Session; user: User } | null> {
	const db = getDB();
	const result = await db
		.select({
			session: sessions,
			user: users
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId));

	const [row] = result;
	if (!row || row.session.expiresAt < new Date()) {
		return null;
	}

	return { session: row.session, user: row.user };
}

export async function deleteSession(sessionId: string): Promise<void> {
	const db = getDB();
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteUserSessions(userId: string): Promise<void> {
	const db = getDB();
	await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function cleanExpiredSessions(): Promise<void> {
	const db = getDB();
	await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

type SameSiteValue = 'lax' | 'strict' | 'none' | 'Lax' | 'Strict' | 'None';

function formatSameSite(value?: SameSiteValue): 'Lax' | 'Strict' | 'None' {
	switch (value) {
		case 'strict':
		case 'Strict':
			return 'Strict';
		case 'none':
		case 'None':
			return 'None';
		default:
			return 'Lax';
	}
}

export function createSessionCookie(
	sessionId: string,
	options?: { secure?: boolean; sameSite?: SameSiteValue }
): string {
	const secure = options?.secure ?? config.infomaniak.redirectUri.startsWith('https');
	const sameSite = formatSameSite(options?.sameSite);
	return [
		`session=${sessionId}`,
		'Path=/',
		'HttpOnly',
		`SameSite=${sameSite}`,
		secure ? 'Secure' : '',
		`Max-Age=${SESSION_DURATION_MS / 1000}`
	]
		.filter(Boolean)
		.join('; ');
}

export function clearSessionCookie(options?: { secure?: boolean; sameSite?: SameSiteValue }): string {
	const secure = options?.secure ?? config.infomaniak.redirectUri.startsWith('https');
	const sameSite = formatSameSite(options?.sameSite);
	return [
		'session=',
		'Path=/',
		'HttpOnly',
		`SameSite=${sameSite}`,
		secure ? 'Secure' : '',
		'Max-Age=0'
	]
		.filter(Boolean)
		.join('; ');
}

export function parseSessionCookie(cookieHeader: string | null): string | null {
	if (!cookieHeader) return null;
	const match = cookieHeader.match(/session=([^;]+)/);
	return match ? match[1] : null;
}
```

**Step 3: Commit**

Run:
```bash
git add src/lib/server/session.ts src/lib/server/types.ts
git commit -m "feat: implement session management utilities"
```

---

## Task 5: Implement Infomaniak OIDC Authentication

**Files:**
- Create: `src/routes/api/auth/login/+server.ts`
- Create: `src/routes/api/auth/callback/+server.ts`
- Create: `src/routes/api/auth/logout/+server.ts`
- Create: `src/routes/api/auth/me/+server.ts`

**Step 1: Create login endpoint**

Create `src/routes/api/auth/login/+server.ts`:
```typescript
import { redirect } from '@sveltejs/kit';
import { config } from '$lib/server/env';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const authUrl = new URL('https://login.infomaniak.com/authorize');
	authUrl.searchParams.set('client_id', config.infomaniak.clientId);
	authUrl.searchParams.set('redirect_uri', config.infomaniak.redirectUri);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('scope', 'openid email profile');

	throw redirect(302, authUrl.toString());
};
```

**Step 2: Create callback endpoint**

Create `src/routes/api/auth/callback/+server.ts`:
```typescript
import { redirect, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { config } from '$lib/server/env';
import { getDB, users } from '$lib/server/db';
import { createSession, createSessionCookie } from '$lib/server/session';
import type { RequestHandler } from './$types';

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	id_token: string;
	token_type: string;
	expires_in: number;
}

interface UserInfo {
	sub: string;
	email?: string;
	name?: string;
	picture?: string;
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	if (!code) {
		throw error(400, 'Missing authorization code');
	}

	// Exchange code for tokens
	const tokenResponse = await fetch('https://login.infomaniak.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id: config.infomaniak.clientId,
			client_secret: config.infomaniak.clientSecret,
			redirect_uri: config.infomaniak.redirectUri
		})
	});

	if (!tokenResponse.ok) {
		throw error(500, 'Failed to exchange authorization code');
	}

	const tokens: TokenResponse = await tokenResponse.json();

	// Get user info
	const userInfoResponse = await fetch('https://login.infomaniak.com/userinfo', {
		headers: {
			Authorization: `Bearer ${tokens.access_token}`
		}
	});

	if (!userInfoResponse.ok) {
		throw error(500, 'Failed to fetch user info');
	}

	const userInfo: UserInfo = await userInfoResponse.json();

	// Create or update user
	const db = getDB();
	let [user] = await db.select().from(users).where(eq(users.infomaniakSub, userInfo.sub));

	if (!user) {
		[user] = await db
			.insert(users)
			.values({
				infomaniakSub: userInfo.sub,
				email: userInfo.email || null,
				name: userInfo.name || null,
				avatarUrl: userInfo.picture || null
			})
			.returning();
	} else {
		[user] = await db
			.update(users)
			.set({
				email: userInfo.email || null,
				name: userInfo.name || null,
				avatarUrl: userInfo.picture || null,
				updatedAt: new Date()
			})
			.where(eq(users.id, user.id))
			.returning();
	}

	// Create session
	const session = await createSession(user.id, tokens.refresh_token);

	// Set cookie
	cookies.set('session', session.id, {
		path: '/',
		httpOnly: true,
		secure: config.infomaniak.redirectUri.startsWith('https'),
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 7 // 7 days
	});

	throw redirect(302, '/app');
};
```

**Step 3: Create logout endpoint**

Create `src/routes/api/auth/logout/+server.ts`:
```typescript
import { redirect } from '@sveltejs/kit';
import { deleteSession, parseSessionCookie } from '$lib/server/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const sessionId = parseSessionCookie(request.headers.get('cookie'));

	if (sessionId) {
		await deleteSession(sessionId);
	}

	cookies.delete('session', { path: '/' });

	throw redirect(302, '/');
};
```

**Step 4: Create me endpoint**

Create `src/routes/api/auth/me/+server.ts`:
```typescript
import { json } from '@sveltejs/kit';
import { getSessionWithUser, parseSessionCookie } from '$lib/server/session';
import type { RequestHandler } from './$types';
import type { UserProfile } from '$lib/server/types';

export const GET: RequestHandler = async ({ request }) => {
	const sessionId = parseSessionCookie(request.headers.get('cookie'));

	if (!sessionId) {
		return json({ user: null });
	}

	const result = await getSessionWithUser(sessionId);

	if (!result) {
		return json({ user: null });
	}

	const userProfile: UserProfile = {
		id: result.user.id,
		email: result.user.email,
		name: result.user.name,
		avatarUrl: result.user.avatarUrl
	};

	return json({ user: userProfile });
};
```

**Step 5: Commit**

Run:
```bash
git add src/routes/api/auth/
git commit -m "feat: implement Infomaniak OIDC authentication endpoints"
```

---

## Task 6: Create Client-Side Auth Store

**Files:**
- Create: `src/lib/stores/auth.svelte.ts`

**Step 1: Create auth store with Svelte 5 runes**

Create `src/lib/stores/auth.svelte.ts`:
```typescript
import type { UserProfile } from '$lib/server/types';

interface AuthState {
	user: UserProfile | null;
	isLoading: boolean;
	isAuthenticated: boolean;
}

let state = $state<AuthState>({
	user: null,
	isLoading: true,
	isAuthenticated: false
});

export function getAuthState(): AuthState {
	return state;
}

export function getUser(): UserProfile | null {
	return state.user;
}

export function isAuthenticated(): boolean {
	return state.isAuthenticated;
}

export function isLoading(): boolean {
	return state.isLoading;
}

export async function fetchUser(): Promise<void> {
	state.isLoading = true;
	try {
		const response = await fetch('/api/auth/me');
		const data = await response.json();
		state.user = data.user;
		state.isAuthenticated = !!data.user;
	} catch (error) {
		console.error('Failed to fetch user:', error);
		state.user = null;
		state.isAuthenticated = false;
	} finally {
		state.isLoading = false;
	}
}

export function login(): void {
	window.location.href = '/api/auth/login';
}

export async function logout(): Promise<void> {
	try {
		await fetch('/api/auth/logout', { method: 'POST' });
		state.user = null;
		state.isAuthenticated = false;
		window.location.href = '/';
	} catch (error) {
		console.error('Logout failed:', error);
	}
}

export function setUser(user: UserProfile | null): void {
	state.user = user;
	state.isAuthenticated = !!user;
	state.isLoading = false;
}
```

**Step 2: Commit**

Run:
```bash
git add src/lib/stores/auth.svelte.ts
git commit -m "feat: create client-side auth store with Svelte 5 runes"
```

---

## Task 7: Create Landing Page

**Files:**
- Modify: `src/routes/+page.svelte`
- Create: `src/routes/+page.ts`

**Step 1: Create page load function**

Create `src/routes/+page.ts`:
```typescript
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const response = await fetch('/api/auth/me');
	const data = await response.json();

	if (data.user) {
		throw redirect(302, '/app');
	}

	return {};
};
```

**Step 2: Create landing page**

Modify `src/routes/+page.svelte`:
```svelte
<script lang="ts">
	import { login } from '$lib/stores/auth.svelte';
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
	<div class="text-center">
		<h1 class="mb-4 text-5xl font-bold text-gray-900">Bissbilanz</h1>
		<p class="mb-8 text-xl text-gray-600">Track your nutrition with ease</p>
		<button
			onclick={login}
			class="rounded-lg bg-indigo-600 px-6 py-3 text-lg font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
		>
			Login with Infomaniak
		</button>
	</div>
</div>
```

**Step 3: Test landing page**

Run:
```bash
bun run dev
```

Visit http://localhost:5173
Expected: See landing page with login button

**Step 4: Commit**

Run:
```bash
git add src/routes/+page.svelte src/routes/+page.ts
git commit -m "feat: create landing page with login redirect"
```

---

## Task 8: Create Authenticated Layout and Dashboard

**Files:**
- Create: `src/routes/app/+layout.svelte`
- Create: `src/routes/app/+layout.ts`
- Create: `src/routes/app/+page.svelte`

**Step 1: Create layout load function**

Create `src/routes/app/+layout.ts`:
```typescript
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch }) => {
	const response = await fetch('/api/auth/me');
	const data = await response.json();

	if (!data.user) {
		throw redirect(302, '/');
	}

	return {
		user: data.user
	};
};
```

**Step 2: Create authenticated layout**

Create `src/routes/app/+layout.svelte`:
```svelte
<script lang="ts">
	import { logout, setUser } from '$lib/stores/auth.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();

	// Set user in auth store
	$effect(() => {
		setUser(data.user);
	});
</script>

<div class="flex min-h-screen flex-col">
	<header class="bg-white shadow">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
			<h1 class="text-2xl font-bold text-gray-900">Bissbilanz</h1>
			<div class="flex items-center gap-4">
				<span class="text-sm text-gray-600">{data.user.name || data.user.email}</span>
				<button
					onclick={logout}
					class="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
				>
					Logout
				</button>
			</div>
		</div>
	</header>

	<main class="flex-1 bg-gray-50">
		{@render children()}
	</main>
</div>
```

**Step 3: Create dashboard page**

Create `src/routes/app/+page.svelte`:
```svelte
<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<h2 class="mb-6 text-3xl font-bold text-gray-900">Dashboard</h2>
	<div class="rounded-lg bg-white p-6 shadow">
		<p class="text-gray-600">Welcome to Bissbilanz! Food tracking coming soon...</p>
	</div>
</div>
```

**Step 4: Test authentication flow**

Run:
```bash
bun run dev
```

Steps to test:
1. Visit http://localhost:5173 → see landing page
2. Click "Login with Infomaniak" → redirect to Infomaniak
3. Login with Infomaniak account
4. Redirect to http://localhost:5173/app → see dashboard
5. Click "Logout" → redirect to landing page

Expected: Full auth flow works

**Step 5: Commit**

Run:
```bash
git add src/routes/app/
git commit -m "feat: create authenticated layout and dashboard"
```

---

## Task 9: Add Server-Side Session Middleware

**Files:**
- Create: `src/hooks.server.ts`

**Step 1: Create hooks for session handling**

Create `src/hooks.server.ts`:
```typescript
import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { getSessionWithUser, parseSessionCookie } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = parseSessionCookie(event.request.headers.get('cookie'));

	if (sessionId) {
		const result = await getSessionWithUser(sessionId);
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
		}
	}

	// Protect /app routes
	if (event.url.pathname.startsWith('/app') && !event.locals.user) {
		throw redirect(302, '/');
	}

	return resolve(event);
};
```

**Step 2: Create app.d.ts for type safety**

Create `src/app.d.ts`:
```typescript
import type { User, Session } from '$lib/server/db';

declare global {
	namespace App {
		interface Locals {
			user?: User;
			session?: Session;
		}
	}
}

export {};
```

**Step 3: Test middleware protection**

Run:
```bash
bun run dev
```

Steps to test:
1. Visit http://localhost:5173/app directly (without login)
2. Expected: Redirect to landing page
3. Login → visit /app
4. Expected: Dashboard loads

**Step 4: Commit**

Run:
```bash
git add src/hooks.server.ts src/app.d.ts
git commit -m "feat: add server-side session middleware for route protection"
```

---

## Task 10: Update CLAUDE.md and Final Testing

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md status**

Modify `CLAUDE.md`, update the "Key Features" section:
```markdown
## Key Features

### Phase 1 (Foundation) - ✅ Complete
- SvelteKit + Bun setup
- Infomaniak authentication (login, callback, logout, me)
- PostgreSQL database with Drizzle ORM
- Database schema (users, sessions, foods, foodEntries, recipes, userGoals, customMealTypes)
- Session-based auth with HttpOnly cookies
- Server-side route protection middleware
- Client-side auth store (Svelte 5 runes)
- Landing page with login
- Authenticated layout and dashboard
- Tailwind CSS + UI dependencies ready

### Phase 2 (Core Tracking) - Planned
- Dashboard with meal sections
- Create/manage food database
- Log food entries
- Daily macro totals
- Set and track goals
```

**Step 2: Run full test of auth flow**

Run:
```bash
bun run dev
```

Test checklist:
- [ ] Landing page loads
- [ ] Login button redirects to Infomaniak
- [ ] After Infomaniak auth, redirects to /app
- [ ] Dashboard shows user name
- [ ] Direct visit to /app without login redirects to /
- [ ] Logout button clears session and redirects to /
- [ ] After logout, visiting /app redirects to /

**Step 3: Check type safety**

Run:
```bash
bun run check
```

Expected: No type errors

**Step 4: Verify database**

Run:
```bash
bun run db:studio
```

Expected: Drizzle Studio opens, shows all tables

**Step 5: Final commit**

Run:
```bash
git add CLAUDE.md
git commit -m "docs: mark Phase 1 as complete in CLAUDE.md"
```

**Step 6: Push to remote (if desired)**

Run:
```bash
git push origin main
```

---

## Completion Checklist

Phase 1 is complete when:
- [x] SvelteKit project initialized with Bun
- [x] Drizzle ORM configured with PostgreSQL
- [x] Database schema created (all tables)
- [x] Infomaniak OIDC authentication working
- [x] Session management implemented
- [x] Client-side auth store created
- [x] Landing page with login
- [x] Authenticated layout and dashboard
- [x] Server-side middleware protecting routes
- [x] CLAUDE.md updated
- [x] All TypeScript types valid
- [x] No console errors in browser
- [x] Can login, logout, and access protected routes

---

## Next Steps

After Phase 1:
1. Review implementation plan for Phase 2 (Core Food Tracking)
2. Create new plan: `2026-02-04-phase2-core-tracking.md`
3. Implement dashboard meal sections, food CRUD, entry logging
4. Set up goals and macro progress tracking

---

## Troubleshooting

**PostgreSQL not running:**
```bash
# Start PostgreSQL (varies by OS)
# macOS (Homebrew): brew services start postgresql
# Linux: sudo systemctl start postgresql
```

**Database connection error:**
- Check DATABASE_URL in .env
- Ensure PostgreSQL is running
- Verify database 'bissbilanz' exists: `createdb bissbilanz`

**Infomaniak auth failing:**
- Verify INFOMANIAK_CLIENT_ID and INFOMANIAK_CLIENT_SECRET
- Check redirect URI matches Infomaniak app settings
- Ensure http://localhost:5173/api/auth/callback is whitelisted

**Session cookie not set:**
- Check browser console for errors
- Verify cookie settings in callback endpoint
- Check SameSite and Secure settings match environment

**Type errors in auth store:**
- Ensure using Svelte 5 syntax (`$state`, `$effect`, `$props`)
- Run `bun run check` for detailed errors
