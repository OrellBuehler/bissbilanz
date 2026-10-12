# Claude integration: admin access, budgets and server-side AI task processing

Status: frozen design for implementation. Subagents follow it exactly; if something here is
wrong, report it instead of improvising. File:line references are against `9330947`.

## 0. Decisions at a glance

| Topic                | Decision                                                                                                                                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enum contract        | **Expand, not extend.** Legacy `aiTaskProcessor` / `processedBy` keep emitting only legacy values (`claude` → `assistant`). New optional fields `aiTaskProcessorKind` and `processedByKind` are `type: string` + `x-extensible-enum` and carry `claude`. Requests accept `aiTaskProcessor: 'claude'`. Evidence in §1.9.          |
| Capability           | Optional top-level `claude: { available, remainingBudgetUsd? }` beside `preferences` in `GET /api/preferences` only.                                                                                                                                                                                                             |
| Budget               | One transaction per API call under a global `pg_advisory_xact_lock`: re-check gates, sum month spend (reservations count at their max-cost), insert a `reserved` usage row. Settled with real usage after the call; unknown outcomes are charged the reservation.                                                                |
| Idempotency          | Per-task DB lease (`claude_task_runs`), conditional `WHERE status='pending'` on every task transition, and a per-task ledger (`claude_task_ledger`) that maps each `log_food` call (payload hash + occurrence) to the entry it created, so a retried loop never logs twice.                                                      |
| Failures             | Transient → task stays pending, retried (3 attempts). Budget exhausted, refusal, unfinished loop, retries exhausted → dismissed with a localized reason (unread → existing notification on every platform). Revoked access / kill switch / no key → task stays pending (assistant fallback), unless entries were already logged. |
| Admin                | `users.is_admin`, granted only by `bun run admin:grant <email>`. `requireAdmin` = cookie session, no bearer, `is_admin`; anything else is a 404.                                                                                                                                                                                 |
| Admin API in clients | Documented in `openapi.ts` (tag `Admin`), excluded from Kotlin DTOs by deleting `Admin*.kt` in `scripts/generate-kotlin-dtos.sh`; iOS fixtures use an allowlist, so nothing to do there.                                                                                                                                         |

## 1. Verified current state

1. **Auth / locals.** `App.Locals = { user?, session?, tokenScopes? }` (`src/app.d.ts:8-13`). A cookie
   session sets `user` + `session` (`src/hooks.server.ts:130-138`); the Bearer fallback runs only when
   no cookie user exists and sets `user` + `tokenScopes`, never `session` (`hooks.server.ts:143-178`,
   scopes at :153/:171). So "cookie session" ⇔ `locals.session && !locals.tokenScopes`. `locals.user`
   is the full `users` row re-read on every request (`src/lib/server/session.ts:66,83`), so a new
   `users.is_admin` column is fresh per request. `requireAuth` / `requireAccountAccess` live in
   `src/lib/server/errors.ts:190-213`. `/api/*` is in `PUBLIC_PATHS` (handlers auth themselves);
   other paths redirect to `/login` when unauthenticated (`hooks.server.ts:182-213`). Writes are
   rate-limited per user in `hooks.server.ts:215-226`; Idempotency-Key replay in `:275-290`.
2. **No user row leaks.** `/api/auth/me` builds an explicit `UserProfile {id,email,name,avatarUrl}`
   (`src/routes/api/auth/me/+server.ts`, `src/lib/server/types.ts:3-8`), is cookie-only and listed
   as `UNDOCUMENTED` web-only (`tests/contract/openapi-coverage.test.ts:23`). `/api/account` and
   `export.ts:88-96` select named columns. Adding `is_admin` leaks nowhere.
3. **CLI pattern.** `scripts/catalog.ts`: own `postgres` client from `DATABASE_URL` (:11-18),
   `resolveUserId(email)` (:109), commands dispatched from argv with usage errors (:153-172),
   wired as `catalog:*` scripts in `package.json:53-56`.
4. **AI tasks.** Table `ai_tasks` (`schema.ts:810-856`), status pg enum `pending|completed|dismissed`
   (`schema.ts:34-36`), `processed_by` text with CHECK `IN ('assistant','on_device','private_cloud')`
   (`schema.ts:851-855`). Server module `src/lib/server/ai-tasks.ts`: `serializeAiTask` spreads every
   column into the response (:19-23, so new `ai_tasks` columns would leak — new state goes in new
   tables), `createAiTask` (:103), `updateAiTask` (:142), `dismissAiTaskByAgent` (:213, leaves
   `acknowledgedAt` null), `cleanupAiTasks` deletes resolved tasks after 30 days (:271). Routes:
   `src/routes/api/ai-tasks/+server.ts` (POST :63), `[id]/+server.ts` (PATCH/DELETE), `photo/`,
   `acknowledge/`. Tasks are only created over REST; MCP never creates them.
5. **Notification mechanism.** "Unread dismissal" = `status='dismissed' && acknowledgedAt == null`.
   Web: `AiTaskWatcher.svelte` toasts + system notification on mount/refocus
   (`src/lib/services/ai-task-service.svelte.ts:22,57,83`); iOS: `AiTaskStore.swift:397`; Android:
   `androidApp/.../aitasks/AiTaskNotifier.kt:69`. Web Push exists (`src/lib/server/push/send.ts:50`)
   but is web-only; not used here.
6. **Proposal mechanism.** Only on-device and only on disk: iOS `ProcessedAiTaskDraft`
   (`Bissbilanz/Persistence/AiTaskDraftDisk.swift:16-29`) holding `MealEstimateItem`s
   (`Services/MealEstimator.swift:84-96`: name, matchedFoodId, quantityDescription, grams, servings,
   calories, protein, carbs, fat, fiber, confidence). There is no server-side proposal; this plan
   adds one whose item shape reuses those field names.
7. **Preferences.** GET/PATCH `src/routes/api/preferences/+server.ts` return `{ preferences }`;
   `getPreferences` (`src/lib/server/preferences.ts:240`) spreads the row; `DEFAULT_PREFERENCES` (:37,
   `aiTaskProcessor` at :80). Column `ai_task_processor` text + CHECK `IN ('assistant','device')`
   (`schema.ts:434,445-448`), `ai_task_auto_log` (:437). Request enum
   `validation/preferences.ts:75`, response enum `validation/responses/preferences.ts:45`.
   Mobile reads it: iOS `BissbilanzAPI+Preferences.swift` → `PreferencesResponse { preferences }`
   (`PhoneShared/Models/Preferences.swift:191`), cached as a JSON blob in SwiftData
   `LocalPreferences` (`PhoneShared/Persistence/LocalModels.swift:394`); Android
   `PreferencesApi.getPreferences()` → `PreferencesRepository.refresh()` caches the generated
   `Preferences` DTO as JSON in SQLDelight (`shared/.../repository/PreferencesRepository.kt:47,117`).
8. **env.ts.** Required vars + all-or-nothing optional groups in `validateEnv` (`env.ts:27-68`),
   values in `config` (`:70-115`), validated at startup in `hooks.server.ts:49-52`.
9. **Enum decoding today (the contract problem).**
   - Android: generated `AiTask.ProcessedBy` and `Preferences.AiTaskProcessor` are Kotlin enums
     (`shared/.../api/generated/model/AiTask.kt:61,90`, `Preferences.kt:82,98`); the client `Json`
     has `ignoreUnknownKeys`/`isLenient` but no `coerceInputValues` (`shared/.../api/BissbilanzApi.kt:28-32`).
     An unknown value throws, failing the whole `/api/ai-tasks` list or preferences decode, and the
     cached preferences JSON would stop decoding too. Exhaustive `when`s over these enums exist in
     `AiTasksScreen.kt:409-412` and `PreferencesRepository.kt:159-165`.
   - iOS: both fields are plain `String` (`Bissbilanz/API/AITaskModels.swift:33`,
     `PhoneShared/Models/Preferences.swift:67,153`), so decoding survives; unknown `processedBy`
     renders no label (`Utilities/Localization.swift:3907`), the settings `Picker` shows no selection.
   - Web: TS unions from the generated client; deployed with the server.
   - MCP: `list_ai_tasks`/`get_ai_task` have no output schema (`create-handlers.ts:1746-1762`,
     `docs/mcp-tools.json` has no `processedBy`); LLM consumers, no decoder.
   - No field in the spec uses `x-extensible-enum` yet; zod-openapi passes it through from
     `.meta({ 'x-extensible-enum': [...] })` (verified: emits `{"type":"string","x-extensible-enum":[…]}`).
     **Conclusion:** shipped Android builds break on a new value → expand with new fields (§9).
10. **MCP handlers.** `createHandlers(deps)` (`src/lib/server/mcp/create-handlers.ts:257`), bound
    instance exported from `mcp/handlers.ts:175`. Reused here: `handleSearchFoods` (:304),
    `handleListRecipes` (:645), `handleGetRecipe` (:654), `handleFindFoodByBarcode` (:778),
    `handleSearchOpenFoodFacts` (:1505), `handleLogFood` (:472, returns `{entryId, dailyStatus}`);
    `dismissAiTaskByAgent` via `ai-tasks.ts`. Workflow text: `MCP_INSTRUCTIONS`
    (`mcp/server.ts:111`), `list_ai_tasks` description (`server.ts:1673`), `process_ai_tasks`
    prompt (`mcp/prompts.ts:137-159`). Device note in `handleListAiTasks` (`create-handlers.ts:1769-1792`).
11. **Photos.** `/uploads/<uuid>.webp`, ≤5 per task (`validation/ai-tasks.ts:10-12`), resized to
    1024 px (`images.ts:20`), stored in `UPLOAD_DIR` (`images.ts:11`); `handleGetAiTask` already
    reads them by filename (`create-handlers.ts:1808-1828`).
12. **OpenAPI + tests.** `apiPaths` in `src/lib/server/openapi.ts:239ff`, capitalized tags
    (`'AiTasks'`, `'Catalog'`), shared `res400/401/404/429` (:160-210). `expectResponseContract`
    (`tests/helpers/contract.ts:42`); `tests/contract/openapi-coverage.test.ts` (UNDOCUMENTED list :9)
    and `response-contract-coverage.test.ts`. API route tests in `tests/api/*.test.ts` with
    `tests/helpers/mock-request-event.ts:19` `createMockEvent`. DB integration tests:
    `tests/integration-db/*.test.ts`, Testcontainers Postgres 18 in `setup.ts`, per-file DB via
    `createTestDatabase/runTestMigrations/getTestDB` (`helpers.ts:11-35`) and
    `vi.doMock('$lib/server/db', …)` (see `ai-tasks.test.ts:15-22`).
13. **Generated artifacts.** `api:generate` = spec + TS client + Kotlin DTOs (all component schemas,
    `scripts/generate-kotlin-dtos.sh`, already deletes catalog models) + iOS fixtures for an
    allowlist of schema names (`scripts/api/generate-ios-fixtures.ts:36ff`).
    `check-migrations.sh` flags `DROP TABLE/COLUMN/TYPE`, not `DROP CONSTRAINT`.
14. **Widgets / watch / Wear OS.** No reference to AI tasks, `processedBy` or the processor in
    `BissbilanzWidgets`, `BissbilanzWatch*`, `Shared/`, `wearApp`, `wearProtocol` (grep). Nothing to change.

## 2. Schema (phase 1, all in `src/lib/server/schema.ts`)

Constants (keep the legacy arrays unchanged, they drive the legacy response enums):

```ts
export const aiTaskProcessorValues = ['assistant', 'device'] as const; // unchanged, legacy response
export const aiTaskProcessorKindValues = ['assistant', 'device', 'claude'] as const; // DB, request, Kind field
export type AiTaskProcessorKind = (typeof aiTaskProcessorKindValues)[number];
export const aiTaskProcessedByValues = ['assistant', 'on_device', 'private_cloud'] as const; // unchanged
export const aiTaskProcessedByKindValues = [...aiTaskProcessedByValues, 'claude'] as const;
export type AiTaskProcessedByKind = (typeof aiTaskProcessedByKindValues)[number];
export const claudeUsageStatusValues = ['reserved', 'succeeded', 'failed', 'abandoned'] as const;
export const claudeRunStateValues = [
	'queued',
	'running',
	'retry_wait',
	'blocked',
	'proposed',
	'accepting',
	'succeeded',
	'dismissed',
	'superseded'
] as const;
export const claudeFailureCodeValues = [
	'budget_exhausted',
	'claude_error',
	'claude_refused',
	'claude_incomplete',
	'claude_stopped',
	'no_access',
	'disabled',
	'not_configured'
] as const;
export const adminAuditActionValues = [
	'admin.grant',
	'admin.revoke',
	'claude_access.grant',
	'claude_access.revoke',
	'claude_access.update',
	'settings.claude_enabled'
] as const;
```

Changes and tables (Drizzle; `ts = timestamp(..., { withTimezone: true })`):

- `users.isAdmin: boolean('is_admin').notNull().default(false)`.
- `user_preferences` CHECK `user_preferences_ai_task_processor_valid` → `IN ('assistant','device','claude')`.
- `ai_tasks` CHECK `ai_tasks_processed_by_valid` → `IS NULL OR IN ('assistant','on_device','private_cloud','claude')`.
- `claude_access`: `id uuid pk defaultRandom`; `userId uuid notNull unique → users.id onDelete cascade`;
  `enabled boolean notNull default false`; `monthlyBudgetUsd numeric('monthly_budget_usd',{precision:10,scale:2,mode:'number'})`
  nullable (= default budget); `grantedBy uuid → users.id onDelete set null`; `grantedAt ts` nullable;
  `note text`; `createdAt ts notNull defaultNow`; `updatedAt ts notNull defaultNow`.
  CHECK `claude_access_budget_range`: `monthly_budget_usd IS NULL OR (monthly_budget_usd >= 0 AND monthly_budget_usd <= 1000)`.
- `claude_usage`: `id uuid pk`; `userId uuid → users.id onDelete set null` (nullable: deleting an
  account anonymizes rows but keeps spend in the global month total); `feature text notNull`
  (`'ai_task'` today); `model text notNull`; `status text notNull default 'reserved'` CHECK in
  `claudeUsageStatusValues`; `inputTokens`, `outputTokens`, `cacheReadInputTokens`,
  `cacheCreationInputTokens` `integer notNull default 0`; `reservedUsd numeric(12,6) mode number notNull default 0`;
  `costUsd numeric(12,6) mode number notNull default 0`; `errorCode text`; `requestId text`;
  `aiTaskId uuid → ai_tasks.id onDelete set null`; `createdAt ts notNull defaultNow`; `settledAt ts`.
  Indexes: `idx_claude_usage_user_created (user_id, created_at)`, `idx_claude_usage_created (created_at)`,
  partial `idx_claude_usage_reserved (created_at) WHERE status = 'reserved'`.
- `admin_audit_log`: `id uuid pk`; `actorUserId uuid → users.id onDelete set null`; `actorLabel text notNull`
  (actor email at the time, or `'cli'`); `action text notNull` CHECK in `adminAuditActionValues`;
  `targetUserId uuid → users.id onDelete set null`; `before jsonb`; `after jsonb`;
  `createdAt ts notNull defaultNow`. Indexes `(target_user_id, created_at)`, `(created_at)`.
- `app_settings`: `key text pk`; `value jsonb notNull`; `updatedBy uuid → users.id onDelete set null`;
  `updatedAt ts notNull defaultNow`. Only key: `'claude_enabled'` → JSON boolean. **Missing row = off.**
- `claude_task_runs` (one row per task, internal): `taskId uuid pk → ai_tasks.id onDelete cascade`;
  `userId uuid notNull → users.id onDelete cascade`; `state text notNull default 'queued'` CHECK in
  `claudeRunStateValues`; `mode text` CHECK `IS NULL OR IN ('auto_log','review')`; `attempt integer notNull default 0`;
  `leaseOwner text`; `leaseExpiresAt ts`; `nextAttemptAt ts`; `proposal jsonb`; `failureCode text`
  CHECK `IS NULL OR IN (claudeFailureCodeValues)`; `failureDetail text`; `createdAt`/`updatedAt ts notNull defaultNow`.
  Indexes `(state, next_attempt_at)`, `(user_id)`.
- `claude_task_ledger`: `taskId uuid → ai_tasks.id onDelete cascade`; `key text notNull`;
  `entryId uuid` (nullable, no FK — same reasoning as `createdEntryIds`); `payload jsonb notNull`;
  `createdAt`/`updatedAt ts notNull defaultNow`; `primaryKey(taskId, key)`.

Migration: `bun run db:generate` → one file. Verify it contains only `ADD COLUMN ... DEFAULT false NOT NULL`,
`CREATE TABLE`/`CREATE INDEX`, and `DROP CONSTRAINT` + `ADD CONSTRAINT` for the two widened CHECKs (not
flagged by `check-migrations.sh`). Then `bun run dev` must start cleanly. Rollback caveat: the previous
image would emit raw `claude` in `processedBy`/`aiTaskProcessor`; before rolling back, run
`UPDATE user_preferences SET ai_task_processor='assistant' WHERE ai_task_processor='claude'` and
`UPDATE ai_tasks SET processed_by='assistant' WHERE processed_by='claude'`. Document this in the PR.

## 3. Environment (phase 1)

`config.claude` in `src/lib/server/env.ts`, documented in `.env.example` under `# Claude (optional)`:

| Var                                | Default                        | Validation (`validateEnv`)             |
| ---------------------------------- | ------------------------------ | -------------------------------------- |
| `ANTHROPIC_API_KEY`                | unset → feature off everywhere | none (never logged)                    |
| `CLAUDE_MODEL`                     | `claude-opus-5-5`              | must match `/^claude-[a-z0-9-]+$/`     |
| `CLAUDE_GLOBAL_MONTHLY_BUDGET_USD` | `90`                           | finite number, `0 ≤ x ≤ 10000`         |
| `CLAUDE_DEFAULT_USER_BUDGET_USD`   | `10`                           | finite number, `0 ≤ x ≤ global budget` |

`config.claude = { apiKey, model, globalMonthlyBudgetUsd, defaultUserBudgetUsd, configured: !!apiKey }`.
Default user budget $10: a task costs roughly $0.08–0.15 on Opus 5.5 (cached ~3k-token system+tools,
1–3 photos at ~1.4k tokens each, 3–4 loop calls, adaptive thinking at `effort: 'low'`), so $10 covers
~70–120 meals a month, i.e. 2–4 a day; nine users at full default spend reach the $90 global cap,
which fits the user base. The admin raises individual budgets; the admin UI shows real per-call cost
to recalibrate after the first week.

## 4. Admin guard and admin flag

`src/lib/server/admin/guard.ts` (phase 1):

```ts
export function isAdminSession(locals: App.Locals): boolean; // !!locals.user?.isAdmin && !!locals.session && !locals.tokenScopes
export function requireAdmin(locals: App.Locals): string; // throws new ApiError(404, 'Not found') otherwise; returns user id
```

Applied in `src/routes/(app)/admin/+layout.server.ts` (`if (!isAdminSession(locals)) error(404, 'Not found')`)
and as the first statement of every `/api/admin/*` handler (inside `try`, so `handleApiError` renders
`{ error: 'Not found' }` with status 404, no Sentry event). Unauthenticated, bearer (mobile, MCP,
test token) and non-admin requests are indistinguishable 404s. CSRF and write rate limiting already
apply via `hooks.server.ts`.

Nav: `/api/auth/me` returns `isAdmin: boolean` (web-only, cookie-only, `UNDOCUMENTED`, not in the
mobile contract); `UserProfile` gains `isAdmin?: boolean`; `getNavGroups({ isAdmin })` appends an
"Admin" item (`ShieldCheck` icon, `/admin`) to the last group only when true. Nothing else exposes it.

`scripts/admin.ts` (phase 1), mirroring `catalog.ts`: `grant <email>`, `revoke <email>`, `list`;
`package.json` scripts `admin:grant|admin:revoke|admin:list`. Grant/revoke update `users.is_admin`
and insert an `admin_audit_log` row (`actorUserId null`, `actorLabel 'cli'`, action `admin.grant|admin.revoke`,
before/after `{ isAdmin }`) in one transaction. No API can change `is_admin`.

## 5. Admin API (phase 2a)

All under `src/routes/api/admin/`, Zod in `src/lib/server/validation/admin.ts` and
`validation/responses/admin.ts` (imported directly, not via `validation/index.ts`), every schema id
prefixed `Admin`, every `operationId` prefixed `admin`, tag `'Admin'`, documented responses
`200, 400 (where input), 404 (res404 = not admin or unknown user), 429 (writes)`. Queries in
`src/lib/server/admin/users.ts`, writes in `src/lib/server/admin/claude-access.ts`.

1. `GET /api/admin/users` — `adminListUsers`. Query `AdminUserListQuery`: `q?: string max 100`
   (ILIKE on name/email), `access?: 'all'|'enabled'|'disabled'` (default all), `sort?: 'createdAt'|'lastActiveAt'|
'name'|'email'|'monthSpendUsd'|'entryCount'` (default `createdAt`), `order?: 'asc'|'desc'` (default desc),
   `limit` 1–100 default 25, `offset` ≥0. 200 `AdminUsersResponse { users: AdminUserRow[], total }`.
   `AdminUserRow = { id, name|null, email|null, avatarUrl|null, isAdmin, providers: string[]
(identities.provider, plus 'infomaniak' when users.infomaniak_sub is set, deduped), createdAt|null,
lastActiveAt|null (GREATEST of max sessions.created_at, max food_entries.created_at, max ai_tasks.created_at),
entryCount, openAiTaskCount (pending), claude: { enabled, monthlyBudgetUsd|null, effectiveBudgetUsd,
monthSpendUsd, monthCalls, note|null } }`. One SQL query with correlated subqueries; month = §6.3.
2. `GET /api/admin/users/{id}` — `adminGetUser`. Query `days` 7–90 default 30. 200
   `AdminUserDetailResponse { user: AdminUserRow, dailyUsage: [{ date: 'YYYY-MM-DD' (UTC), costUsd, calls }]
(every day in range, zero-filled), recentCalls: [{ id, createdAt, feature, model, status, inputTokens,
outputTokens, cacheReadInputTokens, cacheCreationInputTokens, costUsd, errorCode|null,
aiTaskId|null, aiTaskStatus|null }] (latest 50), auditLog: [{ id, createdAt, action, actorLabel,
before, after }] (latest 50 targeting this user) }`. Task content (description/photos) is never shown.
3. `PATCH /api/admin/users/{id}/claude-access` — `adminUpdateClaudeAccess`. Body `AdminClaudeAccessUpdate`
   `{ enabled?: boolean, monthlyBudgetUsd?: number(0–1000, 2 dp)|null, note?: string max 500|null }`,
   refine "at least one field". Upserts `claude_access`; on false→true sets `grantedBy/grantedAt`.
   In the same transaction writes one audit row: `claude_access.grant` (enabled false/absent → true),
   `claude_access.revoke` (true → false), else `claude_access.update`; before/after =
   `{ enabled, monthlyBudgetUsd, note }`. After commit emits `claudeAccessChanged({ userId })` (§6.1).
   200 `AdminClaudeAccessResponse { access: { enabled, monthlyBudgetUsd|null, effectiveBudgetUsd, note|null,
grantedAt|null, updatedAt } }`.
4. `GET /api/admin/claude` — `adminGetClaudeOverview`. 200 `AdminClaudeOverviewResponse { configured,
enabled, model, monthStart (ISO), globalBudgetUsd, defaultUserBudgetUsd, monthSpendUsd, monthCalls,
openReservations, topUsers: [{ userId|null, name|null, email|null, spendUsd, calls }] (5),
runs: { queued, running, retryWait, blocked, proposed, dismissedThisMonth } }`. Never the key.
5. `PATCH /api/admin/claude` — `adminUpdateClaudeSettings`. Body `AdminClaudeSettingsUpdate { enabled: boolean }`.
   Upserts `app_settings('claude_enabled')`, audit `settings.claude_enabled` with before/after
   `{ enabled }`, emits `claudeAccessChanged({})` (all users). 200 `{ enabled }`.

Kotlin: add `rm -f "$OUTPUT_DIR"/Admin*.kt` next to the catalog deletions in
`scripts/generate-kotlin-dtos.sh` (inline schemas are named after the `admin…` operationId, so the
glob catches them). iOS fixture allowlist excludes them by default. TS client types are generated
and used by the admin UI. Admin endpoints are covered by oasdiff like every documented route; keep
changes to them additive (open question §13.6).

### Admin UI (phase 2a, web only)

`src/routes/(app)/admin/+layout.server.ts` (guard), `+page.svelte` (global panel + user list),
`users/[id]/+page.svelte` (detail); components in `src/lib/components/admin/`:
`ClaudeOverviewCard.svelte` (MTD spend vs global budget as a `Progress` bar, top users, kill-switch
`Switch` with confirm `AlertDialog`, model, "API key configured" badge), `UserTable.svelte`
(search `Input` debounced 300 ms, "has access" filter `Select`, sortable headers, `Pagination`,
avatar, name/email, provider badges, created/last active, entries, open tasks, access `Switch`,
month spend + calls, inline budget `Input` saved on blur/Enter with empty = default; on mobile it
collapses to cards), `UserUsageChart.svelte` (layerchart bars, daily cost), `RecentCallsTable.svelte`,
`AccessHistory.svelte`, `AccessDialog.svelte` (grant/revoke with note). Data via `fetch` to
`/api/admin/*` with the generated TS types. Strings: §10.4.

## 6. Claude service (phase 2b, `src/lib/server/claude/`)

### 6.1 Files and exports

| File                 | Phase | Exports                                                                                                                                                                                                                         |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`          | 1     | `claudeConfig()`, `isClaudeConfigured()` (reads `config.claude`)                                                                                                                                                                |
| `settings.ts`        | 1     | `getClaudeEnabled(db?)`, `setClaudeEnabled(actor, enabled)` (app_settings + audit row)                                                                                                                                          |
| `usage.ts`           | 1     | `monthStartUtc(now = new Date()): Date`, `getMonthSpend({ userId?, now? }): Promise<{ spendUsd, calls }>` (formula §6.3), `effectiveUserBudgetUsd(access)`                                                                      |
| `events.ts`          | 1     | `onClaudeAccessChanged(fn)`, `emitClaudeAccessChanged({ userId? })` (in-process; 2a emits, 2b listens)                                                                                                                          |
| `admin/audit.ts`     | 1     | `writeAudit(tx, { actorUserId, actorLabel, action, targetUserId, before, after })`                                                                                                                                              |
| `pricing.ts`         | 2b    | `CLAUDE_PRICING_USD_PER_MTOK`, `priceUsage(model, usage)`, `maxCallCostUsd(model, inputTokens, maxTokens)`                                                                                                                      |
| `client.ts`          | 2b    | `getClaudeClient(): ClaudeClient`, `setClaudeClientForTests(c \| null)`; `type ClaudeClient = { messages: { create(p: Anthropic.MessageCreateParamsNonStreaming, o?: { signal?: AbortSignal }): Promise<Anthropic.Message> } }` |
| `errors.ts`          | 2b    | `ClaudeGateError { code }`, `ClaudeApiError { kind, status?, requestId?, retryable }`, `ClaudeAbortedError`                                                                                                                     |
| `budget.ts`          | 2b    | `reserveCall(...)`, `settleCall(...)`, `abandonStaleReservations()`                                                                                                                                                             |
| `capability.ts`      | 2b    | `getClaudeCapability(userId): Promise<{ available: boolean; remainingBudgetUsd?: number }>`, `assertClaudeAllowed(userId)` (no budget)                                                                                          |
| `call.ts`            | 2b    | `callClaude({ userId, feature, aiTaskId?, params, imageCount, signal? }): Promise<Anthropic.Message>` — the only place that talks to the SDK                                                                                    |
| `tasks/prompt.ts`    | 2b    | `TASK_SYSTEM_PROMPT`, `buildTaskUserContent(task, ctx)`                                                                                                                                                                         |
| `tasks/tools.ts`     | 2b    | `TASK_TOOLS: Anthropic.Tool[]`, `runTaskTool(name, input, ctx)`                                                                                                                                                                 |
| `tasks/runs.ts`      | 2b    | run/ledger DB ops: `ensureRun`, `claimRun`, `heartbeat`, `transition`, `ledgerFind/Record`, `reconcileLedger`                                                                                                                   |
| `tasks/processor.ts` | 2b    | `processTask(taskId, { signal, instanceId })` (the loop, §7)                                                                                                                                                                    |
| `tasks/proposal.ts`  | 2b    | `acceptProposal(userId, taskId, items?)` (§7.6), `serializeClaudeProcessing(run)`                                                                                                                                               |
| `tasks/executor.ts`  | 2b    | `enqueueClaudeTaskIfEligible(userId, taskId)`, `requeueRunForEditedTask(taskId)`, `startClaudeWorker()`, `abortClaudeRuns(userId?)`                                                                                             |

`@anthropic-ai/sdk` is added in phase 1 (`bun add @anthropic-ai/sdk`, exact current version) so
2a/2b don't race on `bun.lock`. Phase 1 also adds the server-side message keys of §10.5.

### 6.2 Pricing (single constant, `pricing.ts`)

USD per million tokens `{ input, output, cacheWrite, cacheRead }`: `claude-opus-5-5 {4, 20, 5, 0.2}`,
`claude-sonnet-5-5 {2, 10, 2.5, 0.2}`, `claude-haiku-5-5 {0.1, 0.5, 0.125, 0.01}` (≤100K prompt; above
that `{0.5, 2.5, 0.625, 0.05}` — pick the tier by `input+cacheRead+cacheWrite` tokens),
`claude-fable-5-1 {10, 50, 12.5, 0.25}`. Unknown model → the most expensive row (never $0).
`priceUsage(model, u) = (u.input_tokens·input + u.output_tokens·output + u.cache_creation_input_tokens·cacheWrite

- u.cache_read_input_tokens·cacheRead) / 1e6`, priced by `response.model`, rounded to 6 dp.
`maxCallCostUsd(model, inTok, maxTok) = (inTok·cacheWrite + maxTok·output) / 1e6` (cache write is the
  highest input rate, so this bounds any cache outcome).

### 6.3 Gates and the budget/reservation algorithm

Gate order (cheapest first), each failure a `ClaudeGateError` with the code in parentheses:

1. key configured (`not_configured`), in memory;
2. kill switch `app_settings.claude_enabled = true` (`disabled`);
3. `claude_access.enabled` for the user (`no_access`);
4. user month spend + reservation ≤ user budget (`user_budget_exhausted`);
5. global month spend + reservation ≤ global budget (`global_budget_exhausted`).

`callClaude` steps:

1. `inputEstimate = ceil(utf8Bytes(JSON.stringify({ system, tools, messages }) with image data removed) / 3)
   - 1600 · imageCount`; `reservedUsd = maxCallCostUsd(model, inputEstimate, params.max_tokens)`.
2. **Reserve** in one transaction:
   ```sql
   SELECT pg_advisory_xact_lock(4210731);                       -- BUDGET_LOCK_KEY, serializes all reservations
   SELECT value FROM app_settings WHERE key = 'claude_enabled';  -- gate 2
   SELECT enabled, monthly_budget_usd FROM claude_access WHERE user_id = $u;  -- gate 3
   SELECT coalesce(sum(CASE WHEN status = 'reserved' THEN reserved_usd ELSE cost_usd END), 0)
     FROM claude_usage WHERE user_id = $u AND created_at >= $monthStart;      -- gate 4
   SELECT coalesce(sum(CASE WHEN status = 'reserved' THEN reserved_usd ELSE cost_usd END), 0)
     FROM claude_usage WHERE created_at >= $monthStart;                       -- gate 5
   INSERT INTO claude_usage (user_id, feature, model, status, reserved_usd, ai_task_id)
     VALUES ($u, $feature, $model, 'reserved', $reservedUsd, $taskId) RETURNING id;
   ```
   `$monthStart = monthStartUtc(now)` = 00:00 UTC on the 1st of the current UTC calendar month; a
   call belongs to the month of its `created_at`. Because every reservation takes the same lock and
   counts open reservations at their maximum, committed reservations never exceed either budget;
   overshoot is limited to the error of the input estimate (the conservative `/3` ratio and cache-write
   pricing make actual ≤ reserved in practice). The lock is held for a few ms; contention is irrelevant
   at this user count.
3. **Call** `client.messages.create(params, { signal })` outside the transaction.
4. **Settle** (`UPDATE claude_usage SET ... , settled_at = now() WHERE id = $id`):
   - success: `status 'succeeded'`, the four token counts, `cost_usd = priceUsage(response.model, usage)`, `request_id`;
   - API error with a response (`Anthropic.APIError` with a status — not billed): `status 'failed'`, `cost_usd 0`, `error_code` = kind;
   - timeout / connection error / abort (billing unknown): `status 'failed'`, `cost_usd = reserved_usd`, `error_code 'billing_unknown'`.
5. **Crash between reserve and settle:** the row stays `reserved` and keeps counting at its maximum.
   `abandonStaleReservations()` (worker sweep) sets rows `reserved` for > 10 min to `abandoned` with
   `cost_usd = reserved_usd`.

Capability (`getClaudeCapability`): runs gates 1–3 plus the two sums (no lock, no insert).
`remainingUsd = min(userBudget − userSpent, globalBudget − globalSpent)`; `available = gates 1–3 pass
&& remainingUsd ≥ MIN_TASK_CALL_USD` where `MIN_TASK_CALL_USD = maxCallCostUsd(model, 12_000, TASK_MAX_TOKENS)`
(≈ $0.22 on Opus 5.5). Response: `{ available: true, remainingBudgetUsd: round2(max(0, remainingUsd)) }`
or `{ available: false }`.

### 6.4 SDK configuration, errors, logging

`new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 })`, created lazily once. Request:
`model = config.claude.model`, `max_tokens = TASK_MAX_TOKENS = 8192`, `output_config: { effort: 'low' }`,
no `thinking` field (adaptive is the default and the only mode on Opus 5.5), no `temperature`/`top_p`,
no prefill, `tool_choice` omitted (`auto`), tools `strict: true`. Error mapping, most specific first:
`APIConnectionTimeoutError → timeout`, `APIConnectionError → connection`, `RateLimitError → rate_limited`,
`InternalServerError (5xx/529) → server`, all retryable; `AuthenticationError`, `PermissionDeniedError`,
`NotFoundError`, `BadRequestError`, other `APIError` → non-retryable (`invalid_request`/`auth`/`other`).
Sentry: gate errors and retryable API errors are `Sentry.logger.info`/breadcrumbs; non-retryable API
errors `captureException(new ClaudeApiError(...))` whose message is built only from kind/status/requestId.
Never pass SDK error objects, request params, prompts, photos or the key to Sentry or `console`. Logs
carry `taskId`, `model`, token counts, `costUsd`, `stop_reason`, iteration.

## 7. AI task processing (phase 2b)

### 7.1 Triggers and executor

- `POST /api/ai-tasks` (2b edits `src/routes/api/ai-tasks/+server.ts`): after the 201 body is built,
  `void enqueueClaudeTaskIfEligible(userId, task.id)` (never throws, never awaited).
- `PATCH /api/ai-tasks/{id}` (phase 3): when a pending task's `description|photoUrls|date|mealType|eatenAt`
  changed, `requeueRunForEditedTask(id)`: a run in `queued|retry_wait|blocked|proposed` goes back to
  `queued` with `proposal = null`; a `running` run is left alone (known gap, §13).
- Worker (`startClaudeWorker()` from `init()` in `hooks.server.ts`, only when configured): immediate
  sweep, then every 2 min: `abandonStaleReservations()`; then select candidates
  ```sql
  SELECT t.id, t.user_id FROM ai_tasks t
    JOIN user_preferences p ON p.user_id = t.user_id AND p.ai_task_processor = 'claude'
    LEFT JOIN claude_task_runs r ON r.task_id = t.id
   WHERE t.status = 'pending' AND t.created_at > now() - interval '7 days'
     AND (r.task_id IS NULL OR r.state = 'queued' OR r.state = 'blocked'
          OR (r.state = 'retry_wait' AND r.next_attempt_at <= now())
          OR (r.state IN ('running','accepting') AND r.lease_expires_at < now()))
   ORDER BY t.created_at LIMIT 50
  ```
  and enqueue those whose `getClaudeCapability` is available (budget-unavailable users are enqueued
  too, so their tasks get the budget dismissal of §7.5; `no_access|disabled|not_configured` are not).
- `enqueueClaudeTaskIfEligible`: processor is `claude` (raw column) → `ensureRun` (`INSERT … ON CONFLICT
DO NOTHING`, state `queued`) → push into the in-process queue.
- Queue: FIFO of task ids, global concurrency 2, per-user 1 (`Map<userId, running>`). A job first
  `claimRun`: `UPDATE claude_task_runs SET state='running', attempt=attempt+1, lease_owner=$instance,
lease_expires_at=now()+interval '3 minutes', mode=coalesce(mode, $mode) WHERE task_id=$1 AND (state IN
('queued','blocked') OR (state='retry_wait' AND next_attempt_at<=now()) OR (state='running' AND
lease_expires_at<now())) RETURNING *` — no row → another worker owns it, skip. A 60 s heartbeat
  extends the lease while the job runs. `$instance = crypto.randomUUID()` per process. Restart
  recovery: leases expire within 3 min and the sweep reclaims (`attempt` increments).
- `onClaudeAccessChanged({ userId })` → `abortClaudeRuns(userId)` (or all) aborts the per-run
  `AbortController`s; the signal is passed to the SDK request, so a revoke or kill switch stops the
  in-flight HTTP call immediately.

### 7.2 Loop

`processTask` loads task (`status` must be `pending`, else run → `superseded`), preferences
(`ai_task_auto_log` → `mode = auto_log|review`, fixed for the run), meal types, time zone, locale,
ledger rows from earlier attempts, photos. Messages start with one user turn (§7.4). Then up to
`MAX_ITERATIONS = 10` API calls:

1. `assertClaudeAllowed(userId)` + task still pending (cheap re-gate before every call);
2. `response = await callClaude(...)` (full gate + reservation per call);
3. `stop_reason === 'refusal'` → finish `claude_refused`;
4. append `response.content` unchanged (thinking blocks included) as the assistant turn;
5. `tool_use` → re-run `assertClaudeAllowed` + pending check, execute every `tool_use` block in order,
   send all `tool_result` blocks in one user message (`is_error: true` on failure, results truncated to
   8 000 chars). `complete_ai_task`/`dismiss_ai_task` end the loop right after executing (no further call);
   tool calls after a terminal one in the same response are answered with an error result and ignored;
6. `end_turn`/`max_tokens` without a terminal tool → append one user text block "Finish now: call
   complete_ai_task or dismiss_ai_task." (allowed once), then continue; the second time → `claude_incomplete`.

Iterations exhausted → `claude_incomplete`. Cache breakpoints: last tool, system block, and the last
content block of the newest user message (moved forward each iteration; ≤ 4 breakpoints). System
prompt and tools are byte-stable (no dates, ids, names); everything per-task is in the user turn.

### 7.3 Tools (`tasks/tools.ts`, all `strict: true`, `additionalProperties: false`, every property in `required`, optional = nullable)

JSON schemas use only `type`, `properties`, `required`, `enum`, `description`, nullable via
`["string","null"]`; bounds are enforced by the Zod schema each input is parsed with before running.

| Tool                   | Input                                                                                                                                                                                                                                      | Runs                                       | Result to model                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `search_foods`         | `query: string, limit: integer\|null` (≤20, default 10)                                                                                                                                                                                    | `handleSearchFoods(userId, query, limit)`  | foods trimmed to `id, name, brand, servingSize, servingUnit, calories, protein, carbs, fat, fiber, labels, recentlyUsed` |
| `list_recipes`         | `query: string`                                                                                                                                                                                                                            | `handleListRecipes(userId, { query })`     | first 20, `id, name, totalServings, cookedWeight`                                                                        |
| `get_recipe`           | `recipeId: string`                                                                                                                                                                                                                         | `handleGetRecipe(userId, id)`              | `id, name, totalServings, cookedWeight`, per-serving macros                                                              |
| `find_food_by_barcode` | `barcode: string`                                                                                                                                                                                                                          | `handleFindFoodByBarcode(userId, barcode)` | as returned minus images/ingredient text; `hint` replaced by "Log it as a quick entry with these per-serving values."    |
| `search_openfoodfacts` | `query: string, limit: integer\|null` (≤5)                                                                                                                                                                                                 | `handleSearchOpenFoodFacts(query, limit)`  | same trimming                                                                                                            |
| `log_food`             | `foodId, recipeId: string\|null; servings: number; mealType: string\|null; eatenAt: string\|null; quickName: string\|null; quickCalories, quickProtein, quickCarbs, quickFat, quickFiber: number\|null; quantityDescription: string\|null` | §7.5                                       | auto: `{ entryId }`; review: `{ proposalItemId }`; or `{ error }`                                                        |
| `complete_ai_task`     | `resultSummary: string`                                                                                                                                                                                                                    | §7.5                                       | `{ success: true }`                                                                                                      |
| `dismiss_ai_task`      | `reason: string`                                                                                                                                                                                                                           | §7.5                                       | `{ success: true }`                                                                                                      |

`date` is always the task's date, `mealType` the task's when set (else the model's, validated by
`createEntry`'s `validateMealType`), `notes` never set. `create_food` and every other MCP tool are not
exposed: barcode/Open Food Facts products are logged as quick entries (§13.4).

### 7.4 Prompt and vision input

`TASK_SYSTEM_PROMPT` = `MCP_INSTRUCTIONS` (imported from `$lib/server/mcp/server`, verbatim) + a fixed
block adapted from `process_ai_tasks` steps 3–6: you process exactly one queued meal; only the listed
tools exist; read every photo; search before logging; amounts are servings; the task's date/meal type
are fixed; never create foods; in REVIEW mode `log_food` records a suggestion instead of a diary entry;
finish with exactly one `complete_ai_task` (summary addressed to the user, naming foods and amounts) or
`dismiss_ai_task` (reason addressed to the user saying what would be needed); write both in the
language named in the task.

User turn content: one `image` block per photo
(`{ type:'image', source:{ type:'base64', media_type:'image/webp', data } }`, read from
`join(UPLOAD_DIR, filename)` after `UPLOAD_FILENAME_PATTERN` check; skip files > 4 MB or unreadable
and say "Photo N is unavailable."), then one text block:

```
Mode: AUTO_LOG | REVIEW
Language: German | English            (users.locale)
Date: 2026-10-12   Time zone: Europe/Zurich
Meal type: Lunch | not set (choose one of: Breakfast, Lunch, Dinner, Snacks, <custom names>)
Eaten at: 2026-10-12T12:30:00+02:00 | not set (pass a plausible eatenAt on the date, ISO 8601 with offset)
Description: <task.description or "none">
Photos: 2 attached
Already logged in an earlier attempt (do not log again): <ledger summaries or "nothing">
```

### 7.5 Writes, idempotency, outcomes

**`log_food`, auto mode.** Build the entry payload; `hash = sha256(canonical JSON of payload minus eatenAt)`;
`occurrence` = how many times this hash was seen in this attempt; `key = log:<hash>:<occurrence>`.
If the ledger has `key` with `entryId` → return it (no write). Otherwise insert the ledger row
(`entryId null`, `payload`) **first**, then `handleLogFood(userId, payload)`; on `{ error }` delete the
ledger row and return the error; on success set `entryId`. At run start `reconcileLedger(taskId)`
resolves rows with `entryId null` (crash between insert and update) by looking for a `food_entries` row
of that user with the same date, meal type, food/recipe/quick name and servings created within
2 minutes after the ledger row and not referenced by another ledger row; found → adopt, else delete
the ledger row. Net effect: a retried or resumed loop never logs an item twice.

**`log_food`, review mode.** `entryCreateSchema.safeParse(payload)`, `validateMealType`, food/recipe
ownership via `getFood`/`getRecipe`; append to `claude_task_runs.proposal.items`:
`{ id: uuid, name, quantityDescription|null, foodId|null, recipeId|null, servings, calories, protein,
carbs, fat, fiber (item totals: food macros × servings; recipe per-serving × servings; quick values ×
servings), entry: <validated payload> }`. Nothing touches the diary.

**`complete_ai_task`.** Auto: new `completeAiTaskBy(userId, id, { resultSummary, entryIds, processedBy:'claude' })`
in `ai-tasks.ts` (`UPDATE … SET status='completed', completed_at, acknowledged_at=now(), processed_by='claude',
created_entry_ids = ledger entry ids, result_summary WHERE id AND user_id AND status='pending'`); run →
`succeeded`. Review: `proposal.summary = resultSummary`; run → `proposed`; task stays pending. Zero
proposal items in review mode → treated as dismissal with the summary as reason.

**`dismiss_ai_task`.** `dismissAiTaskByAgent(userId, id, reason, 'claude', { onlyIfPending: true })`
(type widened to `AiTaskProcessedByKind`, optional guard added; MCP callers unchanged); if the ledger
has entries their ids go into `createdEntryIds` and the localized partial suffix is appended. Run → `dismissed`.

**Server-side outcomes** (run `failureCode` set; dismissals use `dismissAiTaskByAgent(…,'claude',{onlyIfPending})`
with the §10.5 text in `users.locale`, which leaves `acknowledgedAt` null → existing notification):

| Situation                                                                             | Task                                                      | Run                                                               |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `ClaudeGateError` `user_budget_exhausted` / `global_budget_exhausted` (any iteration) | dismissed, `claude_task_reason_budget` (+ partial suffix) | `dismissed`, `budget_exhausted`                                   |
| `no_access` / `disabled` / `not_configured` / abort, no ledger entry (any mode)       | stays pending; a partial proposal is discarded            | `blocked`, code = gate code                                       |
| same, ≥1 ledger entry (auto mode)                                                     | dismissed, `claude_task_reason_stopped` + partial suffix  | `dismissed`, `claude_stopped`                                     |
| retryable `ClaudeApiError` or lease lost, `attempt < 3`                               | stays pending                                             | `retry_wait`, `next_attempt_at = now + [1, 5, 15][attempt-1] min` |
| same, `attempt ≥ 3`, or non-retryable `ClaudeApiError`                                | dismissed, `claude_task_reason_failed` (+ partial)        | `dismissed`, `claude_error`                                       |
| refusal                                                                               | dismissed, `claude_task_reason_refused` (+ partial)       | `dismissed`, `claude_refused`                                     |
| loop unfinished                                                                       | dismissed, `claude_task_reason_incomplete` (+ partial)    | `dismissed`, `claude_incomplete`                                  |
| task no longer pending (user/assistant resolved or deleted it)                        | untouched                                                 | `superseded`                                                      |

Every task transition is conditional on `status = 'pending'`, so a task resolved meanwhile is never
overwritten. A `blocked` run is picked up again by the sweep once the user's gates pass.

**Task state machine** (`ai_tasks.status` + `claude_task_runs.state`):
`pending/∅ →(enqueue) pending/queued →(claim) pending/running →` one of `completed/succeeded`,
`pending/proposed`, `dismissed/dismissed`, `pending/retry_wait →(sweep) running`, `pending/blocked →(sweep) running`.
`pending/proposed →(accept) pending/accepting → completed/succeeded`; `→(user dismiss/delete) dismissed|∅ / superseded`;
`→(edit) pending/queued`. Who sets what: worker (claim, running outcomes), accept endpoint (accepting,
succeeded), PATCH route (requeue), sweep (lease reclaim, abandoned reservations).

### 7.6 Accepting a proposal (`tasks/proposal.ts`, route in phase 3)

`acceptProposal(userId, taskId, items?: { id, servings? }[])`: claim `UPDATE claude_task_runs SET
state='accepting', lease_expires_at = now() + interval '2 minutes' WHERE task_id=$1 AND user_id=$2 AND
(state='proposed' OR (state='accepting' AND lease_expires_at < now())) RETURNING *` (no row → 409 if
the run exists, 404 otherwise); task must be pending (else 409). Selected items (all when omitted;
unknown ids → 400; empty selection → 400) are created through the ledger exactly like auto mode with
`key = accept:<itemId>` and `servings` overridden when given (calls `createEntry` via `handleLogFood`).
Then `completeAiTaskBy(... processedBy:'claude', resultSummary: proposal.summary, entryIds)` and run →
`succeeded`. No Claude call, so no gate: a revoked user can still accept an existing proposal.

## 8. Capability field

`GET /api/preferences` → `{ preferences, claude: { available: boolean, remainingBudgetUsd?: number } }`,
computed by `getClaudeCapability(userId)` (§6.3). `available` is false unless key, kill switch,
access and both budgets pass; `remainingBudgetUsd` (USD, 2 dp, the smaller of user and global
remaining) only when available. PATCH responses do not include it; clients update the capability
from GET only. Schema: `claude: ClaudeCapability.optional()` on `PreferencesResponse` (optional so the
shared schema still describes PATCH). `PATCH /api/preferences` with `aiTaskProcessor: 'claude'` while
`available` is false → 403 `{ error: 'claude_unavailable' }` (new documented status; only new input
triggers it). A stored `claude` is never reset by the server.

## 9. Public contract changes (phase 3)

| Where                                                   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validation/preferences.ts` `aiTaskProcessor` (request) | `z.enum(aiTaskProcessorKindValues)` — accepts `claude` (more input, safe)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `responses/preferences.ts` `Preferences`                | `aiTaskProcessor` unchanged enum, emits `'assistant'` when stored `claude`; new `aiTaskProcessorKind: z.string().meta({ 'x-extensible-enum': aiTaskProcessorKindValues, description }).optional()` (always sent)                                                                                                                                                                                                                                                                                                                                  |
| `responses/preferences.ts` `PreferencesResponse`        | new `claude: ClaudeCapability.optional()`; `ClaudeCapability = { available: boolean, remainingBudgetUsd?: number }` (`meta id 'ClaudeCapability'`)                                                                                                                                                                                                                                                                                                                                                                                                |
| `openapi.ts` `PATCH /api/preferences`                   | new `'403'` response: its own `ClaudeUnavailableResponse` object (`errorResponseSchema`), not `res403` whose text is about token scopes                                                                                                                                                                                                                                                                                                                                                                                                           |
| `responses/ai-tasks.ts` `AiTask`                        | `processedBy` unchanged enum, emits `'assistant'` for stored `claude`; new `processedByKind: z.string().nullable().meta({ x-extensible-enum: aiTaskProcessedByKindValues }).optional()`; new `claudeProcessing: AiTaskClaudeProcessing.nullable().optional()`                                                                                                                                                                                                                                                                                     |
| new schemas                                             | `AiTaskClaudeProcessing { state: string (x-extensible-enum ['queued','running','retrying','proposed','blocked']), proposal: AiTaskProposal.nullable() }`; `AiTaskProposal { summary: string\|null, items: AiTaskProposalItem[] }`; `AiTaskProposalItem { id, name, quantityDescription\|null, foodId\|null, recipeId\|null, servings, calories, protein, carbs, fat, fiber }` (no internal `entry`)                                                                                                                                               |
| new route `POST /api/ai-tasks/{id}/proposal/accept`     | `operationId acceptAiTaskProposal`, tag `AiTasks`, body `AiTaskProposalAccept { items?: { id: uuid, servings?: number>0 }[] max 30 }` (body optional), 200 `AiTaskResponse`, 400, 401, 404, 409, 429                                                                                                                                                                                                                                                                                                                                              |
| `serializeAiTask` (`ai-tasks.ts`)                       | explicit mapping: legacy `processedBy`, `processedByKind` = raw, `claudeProcessing` from the run row (`null` unless a run exists and the task is pending; internal `retry_wait → 'retrying'`, `accepting → 'proposed'`, terminal states → null). List/get use one extra query for runs of the returned ids.                                                                                                                                                                                                                                       |
| `getPreferences` (`preferences.ts`)                     | returns `aiTaskProcessor: legacy(raw)`, `aiTaskProcessorKind: raw`; `DEFAULT_PREFERENCES` gains `aiTaskProcessorKind: 'assistant'`                                                                                                                                                                                                                                                                                                                                                                                                                |
| MCP                                                     | `handleListAiTasks`: when `aiTaskProcessorKind === 'claude'` and the capability is available, `note` = "The user has routed queued tasks to automatic server-side processing by Claude, so do not process them unless the user explicitly asks in this conversation." (`HandlerDeps` gains `getClaudeCapability`). `list_ai_tasks` description: "…routed tasks elsewhere (their iPhone or automatic processing)…". MCP `serializeAiTask` keeps the raw `processedBy` (`claude` possible: no output schema, LLM consumer). `bun run mcp:generate`. |

Every new response field is `.optional()` even though the server always sends it: generated Kotlin
then gets `= null` defaults instead of `@Required`, so Android's cached preferences JSON written by an
older build still decodes (same pattern as `pinnedInsights`). Clients decode the `Kind`/`state`
strings and map unknown values to a fallback (legacy field / no label). Regenerate with
`bun run api:generate` + `bun run mcp:generate`: `docs/openapi.json`, `src/lib/api/generated/schema.d.ts`,
Kotlin `AiTask.kt`, `Preferences.kt`, `PreferencesResponse.kt`, `PreferencesUpdate.kt` (new `claude`
enum case), new `ClaudeCapability.kt`, `AiTaskClaudeProcessing.kt`, `AiTaskProposal*.kt`, iOS fixtures
for `PreferencesResponse`/`AiTask*Response`, `docs/mcp-tools.json`. Then fix the Kotlin compile:
`PreferencesRepository.kt:159-165` maps `PreferencesUpdate.AiTaskProcessor.claude` to legacy
`assistant` and sets `aiTaskProcessorKind = "claude"` on the cached copy. If the Swift decode table in
`APIContractDecodingTests.swift` needs new schema entries, add them. Run `scripts/api/verify.sh`.

## 10. Clients (phase 4; web, Android, iOS in parallel)

Shared behaviour: effective processor = `aiTaskProcessorKind ?? aiTaskProcessor`. Claude option is
listed only when `claude.available` or the stored kind is `claude`; selected but unavailable → shown
as "Claude (unavailable)", not selectable again, with the unavailable hint; the app otherwise behaves
like the assistant processor (no crash, no on-device processing). Choosing Claude shows the privacy
note; the auto-log toggle shows for device **and** claude. Capture is enabled when processor is
claude and available (in addition to device / MCP connected). Task cards: `processedByKind == 'claude'`
→ "Processed by Claude"; pending with `claudeProcessing` → state chip; `proposed` → proposal card
(item list with checkboxes, macros per item using the macro colours, "Log selected" → accept endpoint
with `items: [{id}]`, "Discard" → existing dismiss). No servings editing in v1. Users without access
see none of this (capability false, kind never `claude`, `claudeProcessing` null).

### 10.1 Web

`src/routes/(app)/settings/AiTaskProcessorSelector.svelte` (+ `settings/+page.svelte` passes capability),
`src/lib/services/preferences-service.svelte.ts` + `src/lib/db/types.ts` (store `aiTaskProcessorKind`
and `claude` on the Dexie row; non-indexed, no version bump), `src/routes/(app)/ai-tasks/+page.svelte`,
`src/lib/components/ai-tasks/AiTaskCard.svelte`, new `AiTaskProposal.svelte`,
`AiTaskCaptureModal.svelte` (hint), `src/lib/services/ai-task-service.svelte.ts` (`acceptProposal`).
Strings in `messages/en.json` + `de.json` (§10.4).

### 10.2 Android

`shared/.../api/PreferencesApi.kt` (`getPreferencesResponse()` returning the envelope),
`shared/.../repository/PreferencesRepository.kt` (`claudeCapability: StateFlow<ClaudeCapability?>`,
refreshed with preferences, kept in memory, null = unavailable), `shared/.../api/AiTasksApi.kt`
(`acceptAiTaskProposal`), `shared/.../repository/AiTaskRepository.kt`,
`androidApp/.../screens/SettingsPreferenceCards.kt` (`ChoiceDropdown` option, privacy text, toggle),
`androidApp/.../viewmodels/SettingsViewModel.kt`, `androidApp/.../screens/AiTasksScreen.kt` (label,
state chip, proposal card; `processedByKind` checked before the legacy `when`),
`androidApp/.../components/AiMealSheet.kt` (`canProcess`), `res/values/strings.xml` +
`res/values-de/strings.xml` (same key names as §10.4, `ai_tasks_`/`settings_` prefixes). Wear OS: none.

### 10.3 iOS

`Bissbilanz/API/AITaskModels.swift` (`processedByKind: String?`, `claudeProcessing: AiTaskClaudeProcessing?`,
`AiTaskProposal`, `AiTaskProposalItem`, `AiTaskProposalAccept`), `Bissbilanz/API/BissbilanzAPI+AITasks.swift`
(`acceptAiTaskProposal`), `PhoneShared/Models/Preferences.swift` (`aiTaskProcessorKind: String?` with
`decodeIfPresent`/`encodeIfPresent`; `PreferencesResponse.claude: ClaudeCapability?`; constant
`aiTaskProcessorClaude = "claude"`), `Bissbilanz/Persistence/PreferencesRepository.swift` (store the
capability as JSON in `UserDefaults`, key `claudeCapability`, `nonisolated` helpers per the Swift 6 rules),
`Bissbilanz/Views/SettingsView.swift`, `Bissbilanz/Views/AiTasksView.swift`, `Bissbilanz/Sheets/AIMealSheet.swift`,
`Bissbilanz/Utilities/Localization.swift` (grep before adding), tests in `BissbilanzTests/`.
`Services/AiTaskProcessor.swift` stays keyed on `device` (claude is never processed on-device).
Widgets / watchOS: none.

### 10.4 Client strings (key: en / de)

| Key                                                  | en                                                                                           | de                                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `settings_ai_task_processor_claude`                  | Claude (automatic)                                                                           | Claude (automatisch)                                                                                    |
| `settings_ai_task_processor_claude_unavailable`      | Claude (unavailable)                                                                         | Claude (nicht verfügbar)                                                                                |
| `settings_ai_task_processor_claude_privacy`          | Meal descriptions and photos are sent to Anthropic to be processed by Claude.                | Mahlzeitbeschreibungen und Fotos werden zur Verarbeitung durch Claude an Anthropic gesendet.            |
| `settings_ai_task_processor_claude_unavailable_hint` | Claude is not available for your account right now. Queued meals wait for your AI assistant. | Claude ist für dein Konto gerade nicht verfügbar. Erfasste Mahlzeiten warten auf deinen KI-Assistenten. |
| `settings_ai_task_processor_claude_remaining`        | {amount} left this month                                                                     | Diesen Monat noch {amount}                                                                              |
| `ai_tasks_processed_by_claude`                       | Processed by Claude                                                                          | Von Claude verarbeitet                                                                                  |
| `ai_tasks_claude_state_queued`                       | Waiting for Claude                                                                           | Wartet auf Claude                                                                                       |
| `ai_tasks_claude_state_running`                      | Claude is processing this meal                                                               | Claude verarbeitet diese Mahlzeit                                                                       |
| `ai_tasks_claude_state_retrying`                     | Claude will try again shortly                                                                | Claude versucht es gleich erneut                                                                        |
| `ai_tasks_claude_state_proposed`                     | Suggestion ready for review                                                                  | Vorschlag bereit zur Prüfung                                                                            |
| `ai_tasks_claude_state_blocked`                      | Claude is unavailable, waiting                                                               | Claude ist nicht verfügbar, wartet                                                                      |
| `ai_tasks_proposal_title`                            | Suggested entries                                                                            | Vorgeschlagene Einträge                                                                                 |
| `ai_tasks_proposal_log`                              | Log selected                                                                                 | Auswahl eintragen                                                                                       |
| `ai_tasks_proposal_discard`                          | Discard                                                                                      | Verwerfen                                                                                               |
| `ai_tasks_proposal_none_selected`                    | Select at least one entry.                                                                   | Wähle mindestens einen Eintrag aus.                                                                     |
| `ai_tasks_proposal_logged`                           | Entries logged                                                                               | Einträge eingetragen                                                                                    |
| `ai_tasks_capture_hint_claude`                       | Claude processes this meal on the server and logs it for you.                                | Claude verarbeitet diese Mahlzeit auf dem Server und trägt sie für dich ein.                            |
| `ai_tasks_capture_hint_claude_review`                | Claude processes this meal on the server and suggests entries for you to review.             | Claude verarbeitet diese Mahlzeit auf dem Server und schlägt dir Einträge zur Prüfung vor.              |

Admin UI (web only, phase 2a): `nav_admin` Admin / Admin; `admin_title` Administration / Administration;
`admin_claude_title` Claude / Claude; `admin_claude_configured` API key configured / API-Schlüssel
konfiguriert; `admin_claude_not_configured` No API key configured / Kein API-Schlüssel konfiguriert;
`admin_claude_kill_switch` Claude processing enabled / Claude-Verarbeitung aktiviert;
`admin_claude_kill_switch_confirm_off` Stop all Claude processing now? Running tasks are stopped. /
Jetzt alle Claude-Verarbeitungen stoppen? Laufende Aufgaben werden abgebrochen.;
`admin_claude_model` Model / Modell; `admin_claude_month_spend` {spent} of {budget} this month /
{spent} von {budget} diesen Monat; `admin_claude_top_users` Top users this month / Top-Nutzer diesen
Monat; `admin_users_title` Users / Nutzer; `admin_users_search` Search name or email / Name oder
E-Mail suchen; `admin_users_filter_all` All users / Alle Nutzer; `admin_users_filter_enabled` With
Claude access / Mit Claude-Zugriff; `admin_users_filter_disabled` Without Claude access / Ohne
Claude-Zugriff; `admin_users_col_user` User / Nutzer; `admin_users_col_providers` Sign-in / Anmeldung;
`admin_users_col_created` Created / Erstellt; `admin_users_col_last_active` Last active / Zuletzt
aktiv; `admin_users_col_entries` Entries / Einträge; `admin_users_col_open_tasks` Open AI tasks /
Offene KI-Aufgaben; `admin_users_col_access` Claude / Claude; `admin_users_col_spend` Spend this
month / Ausgaben diesen Monat; `admin_users_col_budget` Budget / Budget; `admin_users_budget_default`
Default ({amount}) / Standard ({amount}); `admin_users_calls` {count} calls / {count} Aufrufe;
`admin_users_empty` No users found / Keine Nutzer gefunden; `admin_user_usage_title` Daily usage /
Tägliche Nutzung; `admin_user_calls_title` Recent calls / Letzte Aufrufe; `admin_user_history_title`
Access history / Zugriffsverlauf; `admin_user_grant` Grant access / Zugriff gewähren;
`admin_user_revoke` Revoke access / Zugriff entziehen; `admin_user_note` Note / Notiz;
`admin_audit_claude_access_grant` Access granted / Zugriff gewährt; `admin_audit_claude_access_revoke`
Access revoked / Zugriff entzogen; `admin_audit_claude_access_update` Access updated / Zugriff
geändert; `admin_audit_admin_grant` Made admin / Zum Admin gemacht; `admin_audit_admin_revoke` Admin
removed / Admin entfernt; `admin_audit_settings_claude_enabled` Kill switch changed / Notschalter
geändert; `admin_saved` Saved / Gespeichert; `admin_save_failed` Could not save / Speichern
fehlgeschlagen.

### 10.5 Server-side strings (added in phase 1, used by 2b with `{ locale }`)

| Key                             | en                                                                                                             | de                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `claude_task_reason_budget`     | Claude could not process this meal because the monthly Claude budget is used up. Please log it yourself.       | Claude konnte diese Mahlzeit nicht verarbeiten, weil das monatliche Claude-Budget aufgebraucht ist. Bitte trage sie selbst ein. |
| `claude_task_reason_failed`     | Claude could not process this meal after several attempts. Please log it yourself.                             | Claude konnte diese Mahlzeit nach mehreren Versuchen nicht verarbeiten. Bitte trage sie selbst ein.                             |
| `claude_task_reason_refused`    | Claude declined to process this meal. Please log it yourself.                                                  | Claude hat die Verarbeitung dieser Mahlzeit abgelehnt. Bitte trage sie selbst ein.                                              |
| `claude_task_reason_incomplete` | Claude could not finish this meal. Please check your diary and log anything missing.                           | Claude konnte diese Mahlzeit nicht abschliessen. Bitte prüfe dein Tagebuch und trage Fehlendes nach.                            |
| `claude_task_reason_stopped`    | Claude processing was stopped before this meal was finished. Please check your diary and log anything missing. | Die Claude-Verarbeitung wurde gestoppt, bevor diese Mahlzeit fertig war. Bitte prüfe dein Tagebuch und trage Fehlendes nach.    |
| `claude_task_partial_suffix`    | Already logged: {items}.                                                                                       | Bereits eingetragen: {items}.                                                                                                   |

## 11. Test plan

**Never mocked:** gates, reservation SQL, settlement, ledger, run claims, conditional task updates.
The only fake is the Anthropic client at the SDK boundary: `setClaudeClientForTests(fake)` where
`fake.messages.create(params, opts)` returns scripted `Anthropic.Message` objects (with `usage`,
`model`, `stop_reason`, `content` incl. `thinking` and `tool_use` blocks), can throw SDK error
classes constructed directly, honours `opts.signal`, and records every `params` for assertions.

Unit (`tests/server/claude/*.test.ts`, vitest): `priceUsage`/`maxCallCostUsd` per model, unknown
model priced at the max row, haiku tier switch; `monthStartUtc` at month edges and DST; input
estimate; legacy/kind mapping functions; `serializeAiTask` + `getPreferences` mapping; tool adapters
trim fields and enforce limits via Zod; tool schemas are strict-valid (`additionalProperties:false`,
all keys required); system prompt + tools contain no date/uuid (byte-stability snapshot); error
mapping order; Sentry receives no key/params (spy); `requireAdmin` matrix (no user, bearer, MCP
token, cookie non-admin → 404; cookie admin → id).

DB integration (`tests/integration-db/claude-*.test.ts`, Testcontainers):

- `claude-budget.test.ts`: gate order; reservation math; 20 concurrent `callClaude` with budget $1
  never commit reservations above $1 and the excess calls get `user_budget_exhausted`; global budget
  across two users; month boundary (rows dated last month ignored); settlement variants; stale
  reservations → `abandoned` at reserved cost; account deletion keeps global spend (user_id null).
- `claude-tasks.test.ts`: auto mode end-to-end (search → log → complete) creates entries and a
  completed task with `processed_by='claude'`; review mode stores a proposal and logs nothing; accept
  all / subset / servings override / unknown id 400 / double accept 409; crash simulation (throw after
  ledger insert, restart) does not double-log; lease steal only after expiry; revoke mid-loop
  (abort signal) → blocked or dismissed per §7.5; budget exhaustion on the 2nd call → dismissed with
  partial suffix and `acknowledgedAt` null; retryable error → `retry_wait` then success; refusal;
  iteration cap; task resolved by MCP meanwhile → run `superseded`, task untouched.
- `claude-admin.test.ts`: access upsert + audit row per change; kill switch audit; CLI grant/revoke
  (import the script's functions) writes `is_admin` + audit.

API (`tests/api/admin-*.test.ts`, `preferences.test.ts`, `ai-tasks*.test.ts`): every documented status
exercised with `expectResponseContract`; `/api/admin/*` 404 for bearer/non-admin; preferences GET
includes `claude`, legacy `aiTaskProcessor` is `assistant` when stored `claude`, PATCH `claude` 403
when unavailable; ai-tasks list maps `processedBy`; accept route statuses. Contract suite
(`tests/contract/*`), `scripts/api/verify.sh`, Android unit tests for the `when` mapping and fallback,
iOS decode tests (CI).

## 12. Work breakdown and file ownership

**Phase 1 — Foundation (one agent, merged before 2a/2b start).** `schema.ts` (everything in §2),
the migration + snapshot, `env.ts`, `.env.example`, `package.json` (`admin:*` scripts,
`@anthropic-ai/sdk`), `bun.lock`, `scripts/admin.ts`, `src/lib/server/admin/guard.ts`,
`src/lib/server/admin/audit.ts`, `src/lib/server/claude/{config,settings,usage,events}.ts`,
`messages/en.json`/`de.json` (§10.5 keys only), unit tests for guard/usage/config, integration test
for the migration. No routes, no `openapi.ts`.

**Phase 2a — Admin UI + API (parallel with 2b).** `src/routes/api/admin/**`,
`src/lib/server/validation/admin.ts`, `validation/responses/admin.ts`, `src/lib/server/admin/{users,claude-access}.ts`,
`openapi.ts` (admin block only), `scripts/generate-kotlin-dtos.sh`, generated `docs/openapi.json` +
`src/lib/api/generated/`, `src/routes/(app)/admin/**`, `src/lib/components/admin/**`,
`src/routes/api/auth/me/+server.ts`, `src/lib/server/types.ts`, `src/lib/config/navigation.ts`,
`src/lib/components/navigation/app-sidebar.svelte`, `messages/*.json` (admin keys), `tests/api/admin-*`,
`tests/integration-db/claude-admin.test.ts`. Must not touch `schema.ts`, `src/lib/server/claude/**` (except calling phase-1 exports).

**Phase 2b — Claude service (parallel with 2a).** `src/lib/server/claude/**` minus phase-1 files,
`src/lib/server/ai-tasks.ts` (`completeAiTaskBy`, `dismissAiTaskByAgent` widening),
`src/routes/api/ai-tasks/+server.ts` (enqueue call), `src/hooks.server.ts` (`startClaudeWorker()` in
`init`), `tests/server/claude/**`, `tests/integration-db/claude-{budget,tasks}.test.ts`. Must not touch
`schema.ts`, `openapi.ts`, `validation/**`, `messages/*.json`, generated files.

**Phase 3 — Contract sync (after 2a+2b merge).** `validation/{preferences,ai-tasks}.ts`,
`validation/responses/{preferences,ai-tasks}.ts`, `validation/index.ts`, `openapi.ts` (public parts),
`src/lib/server/{preferences,ai-tasks}.ts` (serializers), `src/routes/api/preferences/+server.ts`,
`src/routes/api/ai-tasks/[id]/+server.ts` (requeue), new `src/routes/api/ai-tasks/[id]/proposal/accept/+server.ts`,
`src/lib/server/mcp/{create-handlers,handlers,server}.ts`, all generated artifacts, Kotlin compile fix in
`PreferencesRepository.kt`, iOS decode table if needed, `tests/api/{preferences,ai-tasks*}.test.ts`, MCP tests.

**Phase 4 — Clients (parallel).** 4-web: §10.1 + `messages/*.json` client keys. 4-android: §10.2 (shared + androidApp).
4-ios: §10.3. Each implements the shared behaviour of §10 against the phase-3 contract.

Deploy order: server (phases 1–3) first; mobile builds after.

## 13. Open questions and risks (owner)

1. **Budget-blocked tasks are dismissed** (guaranteed notification on every platform, but not picked
   up by the assistant later). Alternative: leave pending and accept that mobile gets no notification.
2. **Default per-user budget $10**, kill switch **off** after deploy (turn it on in `/admin`), auto-pickup
   window 7 days when a user switches to Claude with older pending tasks.
3. **Model/effort:** Opus 5.5 at `effort: 'low'`; switching `CLAUDE_MODEL` to `claude-sonnet-5-5`
   halves cost. Measure in the first week (admin per-call cost).
4. **No `create_food`:** packaged products found by barcode/Open Food Facts are logged as quick
   entries, not saved as foods. Owner may want `create_food` in auto-log mode later.
5. **Proposal review v1** has no servings editing in the UIs (the API already accepts `servings`).
   No push/notification when a proposal is ready; it shows in the AI tasks list.
6. **Admin endpoints in the spec** are guarded by oasdiff like public ones, so they must evolve
   additively. Alternative: keep them `UNDOCUMENTED` (web-only) — rejected because the owner asked for
   openapi registration and the generated TS types help the admin UI.
7. **MCP race:** an MCP assistant told explicitly to process a Claude-routed task can race the
   worker; conditional updates keep the task consistent, but both may log entries. Edits to a task
   while its run is `running` are processed with the pre-edit snapshot.
8. **Rollback** to a pre-feature image needs the two `UPDATE … SET 'assistant'` statements of §2.
9. **Single instance assumed** for abort-on-revoke (in-process events). With several instances a
   revoke still takes effect at the next API call through the reservation gate.
10. **Privacy:** meal text and photos go to Anthropic; the privacy policy page should mention it
    before the kill switch is turned on. `claude_usage` is not part of the account export.
