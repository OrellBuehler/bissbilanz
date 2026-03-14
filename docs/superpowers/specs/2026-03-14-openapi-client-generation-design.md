# OpenAPI Client Generation Design

## Problem

Bissbilanz has three API consumers that each maintain their own type definitions:

1. **SvelteKit frontend** — untyped `apiFetch()` calls with no contracts
2. **Mobile (KMP)** — 40+ hand-written Kotlin DTOs mirroring the server
3. **MCP server** — 40+ tools with inline Zod schemas duplicating validation

This causes drift between clients and server, painful manual DTO maintenance (especially Kotlin), and no compile-time safety on the frontend.

## Goals

- **Type safety across clients** — eliminate hand-written types, generate from a single source
- **Eliminate Kotlin DTO maintenance** — mobile data classes generated from spec
- **Incremental adoption** — no big bang migration, phases are independently shippable

## Non-Goals

- API documentation portal (nice side effect, not the driver)
- Replacing the offline/sync layer in mobile
- Changing the existing Zod validation schemas
- MCP schema consolidation (the MCP tools already use the same Zod schemas for input validation; their inline tool schemas are an MCP SDK requirement and cannot be replaced by OpenAPI types)

## Prerequisites

Before starting Phase 1, a proof-of-concept must validate:

1. **Zod 4 compatibility** — The project uses Zod 4.x. `@asteasolutions/zod-to-openapi` was built for Zod 3. The PoC must confirm that either:
   - `@asteasolutions/zod-to-openapi` supports Zod 4, or
   - An alternative works (`zod-openapi` by Sam Chung, or `zod-to-json-schema` + manual OpenAPI assembly)

   Test: generate an OpenAPI spec fragment from the existing `foodCreateSchema`. Note: this schema builds nutrient fields dynamically via `Object.fromEntries(ALL_NUTRIENT_KEYS.map(...))` spread into `z.object()` — the PoC must verify the library can resolve this pattern.

2. **KMP Kotlin generation** — `openapi-generator` with `kotlin` + `jvm-ktor` produces JVM-only code that won't compile for iOS targets. The PoC must verify that either:
   - The `multiplatform` library option generates compilable KMP code, or
   - DTOs-only generation (`--global-property models`) with `kotlinx_serialization` produces KMP-compatible data classes

   Test: generate DTOs from a small spec, place in `commonMain`, compile for Android and iOS targets.

## Pipeline Overview

```
Zod schemas (source of truth)
    |  bun run api:generate
    |
    +---> OpenAPI 3.1 spec (docs/openapi.json, checked into git)
    +---> TypeScript types + openapi-fetch client (src/lib/api/generated/)
    +---> Kotlin DTOs (mobile/shared/.../api/generated/)
```

Single command `bun run api:generate` runs three steps sequentially:

1. `api:spec` — Zod to OpenAPI spec
2. `api:client:ts` — spec to TypeScript
3. `api:client:kt` — spec to Kotlin DTOs (via Docker)

Generated files are checked into git so CI and mobile builds don't need the generation toolchain.

## Step 1: Zod to OpenAPI Spec

**Tool:** `@asteasolutions/zod-to-openapi` (or alternative per PoC results)

A new file `src/lib/server/openapi.ts` acts as the registry. It imports existing Zod schemas from `src/lib/server/validation/` and registers them with paths and methods:

```typescript
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { foodCreateSchema } from './validation/foods';

const registry = new OpenAPIRegistry();

registry.registerPath({
	method: 'get',
	path: '/api/foods',
	request: { query: paginationSchema.merge(foodSearchSchema) },
	responses: {
		200: {
			content: { 'application/json': { schema: foodsResponseSchema } }
		},
		400: {
			content: { 'application/json': { schema: errorResponseSchema } }
		}
	}
});
```

A script `scripts/generate-openapi.ts` runs the registry and writes `docs/openapi.json`.

**Key decisions:**

- **Response schemas** need to be defined as Zod schemas (currently responses are ad-hoc `json()` calls). This is the biggest piece of new work — ~45 response schemas plus a shared error response schema.
- **Error responses** — a shared `errorResponseSchema` (`{ error: string, details?: Record<string, string[]> }`) is registered on all endpoints for 400/401/404/500 responses. This enables typed error handling in `openapi-fetch`.
- **Polymorphic endpoints** — endpoints like `GET /api/foods` that return different shapes depending on query params (list vs barcode lookup) must be split into separate OpenAPI paths (e.g. `/api/foods` for list, `/api/foods/barcode/{barcode}` for lookup) or use `oneOf` in the response schema.
- Existing request validation schemas stay untouched, they are only registered.
- Auth is documented as `bearerAuth` security scheme but not enforced in codegen.
- Auth endpoints (`/api/auth/*`) and OAuth endpoints (`/api/oauth/*`) are excluded from the spec — they are internal to the auth flow and not consumed by typed clients.
- Response schemas live in `src/lib/server/validation/responses/` (one file per domain, mirroring the request validation structure).

## Step 2: OpenAPI to TypeScript Client

**Tools:** `openapi-typescript` + `openapi-fetch`

`openapi-typescript` reads `docs/openapi.json` and generates `src/lib/api/generated/schema.d.ts` with all path types, request params, and response types.

`openapi-fetch` provides a typed `createClient<paths>()`:

```typescript
import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';
import { apiFetch } from '$lib/utils/api';

export const api = createClient<paths>({ baseUrl: '', fetch: apiFetch });

// Usage — fully typed params, response, errors
const { data, error } = await api.GET('/api/foods', {
	params: { query: { search: 'banana', limit: 20 } }
});
```

**Integration with existing `apiFetch()`:** `openapi-fetch` accepts a custom `fetch` implementation. Passing `apiFetch` preserves offline caching, queueing, and auth transparently. Note: integration testing is needed to verify header merging behavior and that the offline write path's synthetic `{ queued: true }` responses are handled correctly by the typed client.

**Migration path:** New typed client at `src/lib/api/client.ts`. Existing raw `apiFetch()` calls migrate incrementally — both patterns coexist.

## Step 3: OpenAPI to Kotlin DTOs

**Tool:** `openapi-generator-cli` via Docker (`openapitools/openapi-generator-cli`)

**Scope:** DTOs only (data classes with `@Serializable`). The existing hand-written `BissbilanzApi.kt` is kept and updated to use the generated types instead of the hand-written `model/` classes. This avoids KMP compatibility issues with generated API client code.

**Generator config** (`mobile/openapi-generator-config.yaml`):

- Generator: `kotlin` (or `kotlin-client` with `multiplatform` per PoC results)
- Global property: `models` (DTOs only, no API client generation)
- Serialization: `kotlinx_serialization`
- Package: `com.bissbilanz.api.generated`

**Docker invocation:**

```bash
docker run --rm \
  -v "$(pwd):/work" -w /work \
  openapitools/openapi-generator-cli generate \
  -i docs/openapi.json \
  -g kotlin \
  -c mobile/openapi-generator-config.yaml \
  --global-property models \
  -o /work/.openapi-gen-tmp

# Post-process: copy only the model files to the correct KMP location
cp -r .openapi-gen-tmp/src/main/kotlin/com/bissbilanz/api/generated/model/ \
  mobile/shared/src/commonMain/kotlin/com/bissbilanz/api/generated/
rm -rf .openapi-gen-tmp
```

Note: `openapi-generator` treats `-o` as a project root and nests output underneath it. A post-processing step copies just the model files to the correct KMP `commonMain` location and cleans up the temp directory. `.openapi-gen-tmp` is added to `.gitignore` to prevent accidental commits if the script fails mid-run.

**What gets deleted:**

- Hand-written DTOs in `mobile/shared/.../model/` (Food.kt, Entry.kt, Recipe.kt, etc.)

**What stays:**

- `BissbilanzApi.kt` — updated to import generated types instead of hand-written ones
- All repositories, offline layer, sync queue — unchanged

## Script Structure

**Package.json scripts:**

```json
{
	"api:spec": "bun run scripts/generate-openapi.ts",
	"api:client:ts": "bunx openapi-typescript docs/openapi.json -o src/lib/api/generated/schema.d.ts",
	"api:client:kt": "scripts/generate-kotlin-dtos.sh",
	"api:generate": "bun run api:spec && bun run api:client:ts && bun run api:client:kt",
	"api:check": "bun run api:generate && git diff --exit-code docs/openapi.json src/lib/api/generated/ mobile/shared/src/commonMain/kotlin/com/bissbilanz/api/generated/"
}
```

The Kotlin generation is wrapped in a shell script (`scripts/generate-kotlin-dtos.sh`) to handle the Docker invocation and post-processing cleanup.

`api:check` verifies generated files are up-to-date — used in CI from Phase 1 onward.

**Developer workflow:**

1. Edit Zod schema in `src/lib/server/validation/`
2. Add/update response schema and path registration in `src/lib/server/openapi.ts`
3. Run `bun run api:generate`
4. Review diffs in generated files
5. Update call sites if API shape changed
6. Commit everything (spec + generated code)

**Future improvement:** Step 2 (manual registry updates) could be automated by co-locating OpenAPI metadata with route handlers. Not in scope for this design.

## New Files

| File                                   | Purpose                                    |
| -------------------------------------- | ------------------------------------------ |
| `scripts/generate-openapi.ts`          | Spec generator script                      |
| `scripts/generate-kotlin-dtos.sh`      | Kotlin DTO generation + post-processing    |
| `src/lib/server/openapi.ts`            | Path + response schema registry            |
| `src/lib/server/validation/responses/` | Response Zod schemas (one file per domain) |
| `src/lib/api/generated/schema.d.ts`    | Generated TypeScript types                 |
| `src/lib/api/client.ts`                | Typed frontend client wrapping `apiFetch`  |
| `mobile/openapi-generator-config.yaml` | Kotlin generator config                    |
| `mobile/shared/.../api/generated/`     | Generated Kotlin DTOs                      |
| `docs/openapi.json`                    | Generated OpenAPI 3.1 spec                 |

## Migration Strategy

### Phase 0 — Proof of Concept

- Validate Zod 4 compatibility with chosen Zod-to-OpenAPI library
- Validate Kotlin DTO generation produces KMP-compatible code
- Test: generate from `foodCreateSchema`, compile on Android target
- **Go/no-go decision**

### Phase 1 — Foundation (no breaking changes)

- Add dependencies (Zod-to-OpenAPI lib, `openapi-typescript`, `openapi-fetch`)
- Write response schemas for all ~45 endpoints (including shared error schema)
- Handle polymorphic endpoints (split or `oneOf`)
- Build the registry in `openapi.ts`, register all paths
- Generate the OpenAPI spec, TypeScript types, and Kotlin DTOs
- Wire up `api:generate` and `api:check` scripts
- Add `api:check` to CI
- **Review checkpoint**

### Phase 2 — Frontend migration (incremental)

- Create `src/lib/api/client.ts` with `openapi-fetch` + `apiFetch` as custom fetch
- Integration test: verify offline queueing and header merging work with typed client
- Migrate pages/components one by one from raw `apiFetch()` to typed client
- Both patterns coexist, old code keeps working
- **Review checkpoint**

### Phase 3 — Mobile migration (bigger lift)

- Replace hand-written DTOs with generated data classes
- Update `BissbilanzApi.kt` to import generated types
- Update all imports from `com.bissbilanz.model` to `com.bissbilanz.api.generated` (~15 files across repositories and Android app)
- Delete old `model/` files
- Run full Android build + tests to verify
- **Review checkpoint**

### Phase 4 — Cleanup

- Remove unused hand-written types on both platforms
- Verify no remaining untyped API calls on frontend
- **Review checkpoint**

Phase 0 is the prerequisite for everything. Phase 1 follows. Phases 2 and 3 can happen in parallel after Phase 1. Phase 4 follows both.

## Parallelization Notes

Within phases, subagents can handle independent work:

- **Phase 1:** Response schemas can be written in parallel per domain (foods, entries, recipes, supplements, weight, stats, goals, preferences, meal-types)
- **Phase 2:** Frontend page migrations are independent of each other
- **Phase 3:** Repository updates are mostly independent once DTOs are swapped

Code review runs after each phase completes.

## Risks

| Risk                                                                         | Mitigation                                                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Zod 4 incompatibility with all Zod-to-OpenAPI libs                           | Phase 0 PoC; fallback: `zod-to-json-schema` + manual OpenAPI wrapper                           |
| Generated Kotlin DTOs have JVM-only imports                                  | Phase 0 PoC; fallback: DTOs-only with `--global-property models`, manually strip JVM imports   |
| `openapi-fetch` + `apiFetch` integration issues (headers, offline responses) | Phase 2 integration test before migrating call sites                                           |
| Response schema drift from actual API responses                              | `api:check` in CI catches spec drift; consider adding runtime response validation in dev mode  |
| `openapi-generator` version updates break Kotlin output                      | Pin Docker image tag in `generate-kotlin-dtos.sh`                                              |
| `openapi-typescript` major version changes output format                     | Pin exact version in `package.json`                                                            |
| CI runners may not have Docker for `api:check`                               | Kotlin check runs in a separate CI job that requires Docker; TS spec check runs without Docker |
