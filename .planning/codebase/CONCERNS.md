# Codebase Concerns

**Analysis Date:** 2026-02-17

## Tech Debt

**Excessive `any` type usage in Svelte components:**
- Issue: Multiple component pages use `any` for payload types and state instead of proper TypeScript interfaces
- Files:
  - `src/routes/app/+page.svelte` (lines 18, 20, 28, 46)
  - `src/routes/app/foods/+page.svelte` (lines 13, 23)
  - `src/routes/app/foods/new/+page.svelte` (lines 11, 74)
  - `src/routes/app/recipes/+page.svelte` (food/recipe payloads)
  - `src/routes/app/history/[date]/+page.svelte` (entries state)
- Impact: Reduces type safety at component boundaries; breaks IDE refactoring; makes debugging harder; violates strict TypeScript config
- Fix approach: Create shared types for food/recipe/entry payloads in `src/lib/types/` (e.g., `types.ts` with `type FoodPayload`, `type EntryPayload`); import and use instead of `any`

**Unhandled API response parsing in client code:**
- Issue: Multiple client-side API calls directly parse JSON without validating status codes before accessing response data
- Files:
  - `src/routes/app/+page.svelte` (lines 41-43: assumes response is successful)
  - `src/routes/app/foods/+page.svelte` (lines 17-21: no status check before `.json()`)
  - `src/routes/app/history/+page.svelte` (similar pattern)
- Impact: 4xx/5xx errors will silently fail when calling `.json()` on error response, leading to undefined data assigned to state
- Fix approach: Check `res.ok` before parsing JSON in all client-side fetch calls; use `apiFetch()` utility consistently which already handles queuing but should also validate response status

**Missing response validation in critical endpoints:**
- Issue: Some API responses are not validated against their declared shape before use
- Files:
  - `src/routes/app/foods/+page.svelte` (line 20: `foods = data.foods` without validation)
  - `src/routes/api/foods/+server.ts` (returns `{ foods }` but no Zod schema for response shape)
  - Multiple food entry endpoints return unvalidated JSON
- Impact: Malformed responses from database or queries will silently propagate invalid data to UI
- Fix approach: Create response schemas for all API endpoints; validate before returning JSON in routes; consider response wrapper type

**Pagination limits not enforced at API level:**
- Issue: `listFoods()` and `listEntriesByDate()` use default limit of 100 without server-side max limit enforcement
- Files:
  - `src/lib/server/foods.ts` (line 48: `limit = options?.limit ?? 100` with no upper bound)
  - `src/lib/server/entries.ts` (line 17: same pattern)
  - `src/lib/server/validation/pagination.ts` (max limit not enforced)
- Impact: Malicious clients can request 10000+ items in single query, causing database load spike and slow API responses
- Fix approach: Add `MAX_LIMIT` constant (e.g., 500); clamp user-provided limit: `limit = Math.min(options?.limit ?? 100, MAX_LIMIT)`

**Console logging in production code:**
- Issue: Error logging uses `console.error()` and `console.log()` without structured logging
- Files:
  - `src/lib/server/errors.ts` (line 65: `console.error('Unhandled error:', error)`)
  - `src/lib/server/db.ts` (migration logs to console)
  - `src/routes/app/settings/mcp/+page.server.ts` (error logging in form actions)
  - `src/lib/stores/auth.svelte.ts` (client-side error logging)
- Impact: Difficult to trace errors in production; no log aggregation/monitoring; sensitive error details exposed
- Fix approach: Create `src/lib/server/logger.ts` with structured logging; use pino or winston for production logging with proper log levels

**No explicit error boundaries in complex components:**
- Issue: Large components with multiple data dependencies have no error states or recovery mechanisms
- Files:
  - `src/routes/app/+page.svelte` (loads foods, recipes, entries; one failure cascades)
  - `src/routes/app/foods/+page.svelte` (enrichFood operation has no error feedback)
- Impact: User sees empty page or frozen UI if one API call fails; no clear error messaging
- Fix approach: Add try-catch around data loading; set error state; show error toast; implement individual retry buttons for each section

---

## Known Issues

**Bun test runner "Unhandled error between tests" in session-db and oauth-db:**
- Symptoms: Test output shows "Unhandled error between tests" but all tests pass when run individually
- Files: `tests/server/session-db.test.ts`, `tests/server/oauth-db.test.ts`
- Trigger: Running full test suite with `bun test`
- Cause: Module mock persistence across test files; cleanup artifacts not affecting actual test results
- Workaround: Tests pass individually (`bun test tests/server/session-db.test.ts`); does not affect CI/CD
- Status: Non-blocking; identified and documented in CLAUDE.md

**Offline queue doesn't persist across page reloads:**
- Issue: Client-side offline queue (`src/lib/stores/offline-queue.ts`) stored in memory; lost if user refreshes while offline
- Files: `src/lib/utils/api.ts`, `src/lib/stores/offline-queue.ts`, `src/routes/app/+layout.svelte`
- Impact: Unsync'd edits are lost on page reload; user loses work during connectivity issues
- Fix approach: Persist queue to IndexedDB; restore on app load; implement durability check before queue flush

---

## Security Considerations

**localStorage used for PWA install banner state without verification:**
- Risk: localStorage value `bissbilanz-install-dismissed` can be spoofed by malicious scripts; not sensitive but demonstrates trust issue
- Files: `src/lib/components/pwa/InstallBanner.svelte` (lines with `localStorage.getItem/setItem`)
- Current mitigation: Value is non-sensitive boolean flag
- Recommendations: Use HttpOnly cookie for security-sensitive state; validate on server side for critical state

**OAuth token stored in session but encrypted inconsistently:**
- Risk: Refresh tokens encrypted with `encryptToken()` but access tokens not explicitly protected
- Files:
  - `src/lib/server/session.ts` (lines 16-18: refresh token encrypted)
  - `src/lib/server/oauth.ts` (token generation)
- Current mitigation: Tokens are in HttpOnly cookies; server-side session
- Recommendations: Document encryption strategy; ensure all sensitive tokens use consistent encryption

**MCP endpoint has limited scope validation:**
- Risk: MCP endpoint at `/api/mcp` validates token but scope checking may be bypassed if request format changes
- Files: `src/routes/api/mcp/+server.ts` (lines 10, 28-46 - scope validation)
- Current mitigation: Bearer token validation with scope check
- Recommendations: Add request validation with Zod for authorization header format; test scope rejection with invalid tokens

**Email addresses not validated for uniqueness at OAuth registration:**
- Risk: Multiple users could claim same email if Infomaniak OIDC allows during migration or sync issues
- Files: `src/lib/server/oauth.ts` (user creation), `src/lib/server/schema.ts` (users table)
- Current mitigation: Email field has no unique constraint (by design for OIDC)
- Recommendations: Add validation in user lookup to use `infomaniakSub` as source of truth; add database constraint on `infomaniak_sub`

---

## Performance Bottlenecks

**bcrypt hash computation in auth routes (600ms overhead):**
- Problem: Token hashing uses bcrypt with SALT_ROUNDS=10 on every OAuth token validation
- Files: `src/lib/server/oauth.ts` (lines 35-40: hashToken, verifyToken calls)
- Cause: bcrypt is intentionally slow for security; called on every authorization request
- Impact: Auth routes slow by ~600ms per request during token validation
- Improvement path: Cache token validation results with short TTL (60s); consider hmac-sha256 for non-cryptographic comparisons if token storage allows

**N+1 query risk in entry listing with food details:**
- Problem: `listEntriesByDate()` uses `leftJoin(foods)` but retrieves only selected food fields; if more fields needed later, could trigger additional queries
- Files: `src/lib/server/entries.ts` (lines 20-38: hardcoded select fields)
- Cause: Join selects specific columns; if caller needs different columns, must create new query function
- Impact: Minor; current schema has few fields; but pattern is fragile
- Improvement path: Return full joined objects; let caller select needed fields; or create typed view

**Barcode enrichment is synchronous block for user:**
- Problem: `enrichFood()` makes sequential fetch to Open Food Facts, PATCH to update food, then refetch all foods
- Files: `src/routes/app/foods/+page.svelte` (lines 38-54)
- Cause: User action triggers 3 sequential API calls
- Impact: User sees lag during barcode enrichment; blocking UI updates
- Improvement path: Make enrichment background operation; update UI optimistically; refetch foods in parallel with other operations

---

## Fragile Areas

**Large OAuth implementation with complex token flows:**
- Files: `src/lib/server/oauth.ts` (368 lines)
- Why fragile: Contains PKCE validation, token generation, authorization code flows, token refresh; many edge cases (expired codes, invalid PKCE, revoked tokens)
- Safe modification: Add comprehensive test coverage for all code paths; test token expiration scenarios; validate against OAuth 2.0 spec
- Test coverage: Tests exist (`tests/server/oauth-db.test.ts`, `tests/server/oidc-jwt.test.ts`) but not all edge cases covered; PKCE validation needs explicit tests for invalid challenges

**Large Svelte components with multiple responsibilities:**
- Files:
  - `src/routes/app/+page.svelte` (202 lines: dashboard, entries, chart, modals)
  - `src/lib/components/foods/FoodForm.svelte` (201 lines: form state, validation, advanced fields)
  - `src/routes/app/foods/+page.svelte` (149 lines: CRUD + search + enrichment)
- Why fragile: Multiple $state variables; complex $derived chains; hard to test in isolation; changes to one feature affect entire component
- Safe modification: Extract smaller sub-components; move data loading to server routes; use composition over monolithic components
- Test coverage: No unit tests for Svelte component logic; E2E tests only

**MCP server implementation with dynamic tool registration:**
- Files: `src/lib/server/mcp/server.ts` (137 lines), `src/routes/api/mcp/+server.ts` (199 lines)
- Why fragile: SessionState map in memory; tool handlers call server functions with userId; no session cleanup; concurrent request handling untested
- Safe modification: Add session timeout/cleanup logic; test concurrent MCP requests; validate tool input schemas strictly
- Test coverage: No tests for MCP server; handlers tested separately in `tests/server/mcp-handlers.test.ts` but not transport layer

**Database schema with migration ordering dependencies:**
- Files: `drizzle/` folder with 6 migrations
- Why fragile: Drizzle migrations are sequential; if migration fails mid-deploy, schema state is uncertain
- Safe modification: Always run migrations in staging first; test rollback procedures; document any manual migration steps
- Test coverage: No migration rollback tests; migrations assumed to be append-only

---

## Scaling Limits

**In-memory session transport map in MCP endpoint:**
- Current capacity: Unbounded map grows with concurrent connections
- Limit: Memory exhaustion if many concurrent users connect to `/api/mcp` without cleanup
- Files: `src/routes/api/mcp/+server.ts` (line 17: `const sessionTransports = new Map()`)
- Scaling path: Implement session timeout (cleanup after 5 minutes idle); add max sessions limit; consider Redis for multi-process deployments

**Pagination defaults allow up to 100 items per query:**
- Current capacity: 100 items * ~500 bytes = ~50KB per list query
- Limit: With 10,000+ foods per user, loading all with default pagination hits memory/bandwidth limits
- Files: `src/lib/server/foods.ts`, `src/lib/server/entries.ts` (default limit=100)
- Scaling path: Implement cursor-based pagination; optimize database indexes on userId + date; cache frequently accessed foods

**Offline queue stored in memory only:**
- Current capacity: All pending requests fit in browser memory
- Limit: Large pending operations (file uploads, media) will fail; queue lost on refresh
- Files: `src/lib/stores/offline-queue.ts`
- Scaling path: Use IndexedDB for persistence; implement background sync API; add size limits to queue

---

## Dependencies at Risk

**Svelte 5 is newly released and breaking changes possible:**
- Risk: App uses Svelte 5 runes (new in v5.0); future versions may require migration
- Files: All `.svelte` components use `$state`, `$derived`, `$effect`
- Impact: Svelte 5 is still stabilizing; breaking changes in patches possible
- Migration plan: Pin Svelte to exact version in package.json; monitor release notes; test before upgrading minor versions

**MCP SDK (@modelcontextprotocol/sdk) is < 1.0:**
- Risk: Pre-1.0 SDKs often have breaking changes; API not finalized
- Files: `src/routes/api/mcp/+server.ts`, `src/lib/server/mcp/server.ts`
- Impact: Future SDK updates may require code changes
- Migration plan: Pin exact version; implement abstraction layer for MCP types; test SDK upgrades in staging

**Open Food Facts API integration has no fallback:**
- Risk: If OFF API is unavailable, barcode enrichment fails silently
- Files: `src/routes/api/openfoodfacts/[barcode]/+server.ts`, `src/routes/app/foods/+page.svelte`
- Impact: Users can't enrich foods with barcode data during OFF outages
- Migration plan: Cache successful OFF responses; show user friendly message if API unreachable; consider cached dataset fallback

---

## Missing Critical Features

**No database query monitoring or slow query logging:**
- Problem: Can't identify which queries are slow in production
- Blocks: Performance optimization; troubleshooting user complaints about slowness
- Solution: Add query logging middleware to Drizzle; log queries taking > 100ms; export metrics to monitoring service

**No structured error reporting or error tracking:**
- Problem: Unhandled errors logged to console; invisible in production
- Blocks: Post-incident analysis; error trend monitoring; alerting on critical failures
- Solution: Integrate Sentry or Axiom; send errors server-side; track error rates by endpoint

**No audit logging for user data changes:**
- Problem: Can't track who deleted/modified foods, recipes, entries
- Blocks: Compliance; debugging data loss; user support
- Solution: Create audit_log table; log all mutations with userId, timestamp, old_value, new_value

**No rate limiting on expensive operations:**
- Problem: Barcode enrichment endpoint has no rate limit
- Blocks: DOS protection; preventing API abuse
- Solution: Implement rate limiting middleware; limit barcode lookups to 10/min per user

---

## Test Coverage Gaps

**Svelte component logic untested:**
- What's not tested: FoodForm validation, entry modal flows, barcode scanner integration
- Files: `src/lib/components/foods/FoodForm.svelte`, `src/lib/components/entries/AddFoodModal.svelte`, `src/lib/components/barcode/BarcodeScanModal.svelte`
- Risk: Component bugs go undetected; refactoring is unsafe; edge cases in form validation not caught
- Priority: High — these are core user-facing features

**MCP transport and session handling untested:**
- What's not tested: Concurrent MCP requests, session timeout, invalid authorization headers
- Files: `src/routes/api/mcp/+server.ts` (transport layer only; handlers are tested)
- Risk: Production bugs in session handling; no confidence in concurrent request safety
- Priority: High — MCP is critical integration point

**Offline queue persistence not tested:**
- What's not tested: Queue survival across page reloads, sync retry logic, conflict resolution
- Files: `src/lib/stores/offline-queue.ts`, `src/routes/app/+layout.svelte` (sync dispatch)
- Risk: Offline feature silently broken; user data loss during sync
- Priority: Medium — affects PWA use case but not core functionality

**OAuth token refresh edge cases untested:**
- What's not tested: Refresh token expiration, refresh during request, concurrent refresh attempts
- Files: `src/lib/server/oauth.ts`, `src/routes/api/auth/callback/+server.ts`
- Risk: Token expiration causes silent 401s; users get logged out unexpectedly
- Priority: High — authentication is critical

**Database migration rollback not tested:**
- What's not tested: Schema rollback from migration failure, data safety during migrations
- Files: `drizzle/` migrations
- Risk: Failed migration leaves database in unknown state; no recovery path
- Priority: Medium — only affects deployments but high impact if occurs

---

*Concerns audit: 2026-02-17*
