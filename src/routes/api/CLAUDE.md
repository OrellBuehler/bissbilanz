# API routes and the public API contract

Applies to `src/routes/api/**`. The same stability rules bind `src/lib/server/validation/`, `src/lib/server/openapi.ts`, `src/lib/server/mcp/` and `drizzle/`.

## API Routes

- Validate inputs with Zod schemas
- Validation schemas are in `src/lib/server/validation/` (one file per domain)
- Return consistent error format: `{ error: string }`
- Always check user authentication/authorization
- Use HTTP status codes correctly (200, 201, 400, 401, 404, 500)
- The OpenAPI spec (`docs/openapi.json`) and TS/Kotlin clients are generated from the Zod schemas via `bun run api:generate` — rerun and commit the output after changing API routes or validation schemas (the API Contract workflow fails otherwise)
- Every new route goes into `src/lib/server/openapi.ts`; `tests/contract/openapi-coverage.test.ts` fails otherwise
- Every new or changed endpoint needs an `expectResponseContract(method, path, response)` assertion (`tests/helpers/contract.ts`) in its `tests/api/*.test.ts` test, for each documented status it exercises — `tests/contract/response-contract-coverage.test.ts` fails on a documented 2xx JSON operation with none

## API Stability (CRITICAL)

`/api/*` and the MCP tools are a public contract: shipped Android/iOS builds, offline queues replaying old requests, and MCP clients all depend on them. There is no URL versioning; the API evolves additively. Full policy: `docs/api-stability.md`.

- **Additive only:** new endpoints, new optional request fields, new response fields. Never remove/rename a field, endpoint, tool or parameter; never add a required request field; never make a response field optional/nullable; never tighten validation on existing input.
- **No new values in response enums** unless the field is marked `x-extensible-enum` and every client decodes unknown values — iOS `Codable` enums fail on them and sync drops the change silently.
- **Semantic changes are breaking** even when the shape is identical (units, per-serving vs. total, defaults when a field is omitted). Add a new field instead of changing the meaning of an old one.
- **Changing a contract:** expand (add new beside old) → migrate clients → deprecate (`deprecated: true` + `x-sunset`) → remove after the support window in a separate PR labelled `api-breaking-change`. Never add that label to get a feature through CI; ask the user first.
- **Deploy order:** server before the mobile builds that use a new field or endpoint.
- **Forcing updates:** clients send `X-Client-Platform`/`X-Client-Version`; raising `MIN_CLIENT_VERSIONS` in `src/lib/server/client-version.ts` makes older builds get 426 and an update screen. Check `bun run clients:versions` first, and never make any client treat 426 as a failure that drops queued changes or signs the user out.
- **Migrations are expand/contract too:** no `DROP`/`RENAME`/type change in the release that stops using the column. A reviewed destructive migration needs a `-- destructive-ok: <reason>` line.
- Run `scripts/api/verify.sh` before opening a PR that touches routes, validation schemas, MCP tools or migrations.
