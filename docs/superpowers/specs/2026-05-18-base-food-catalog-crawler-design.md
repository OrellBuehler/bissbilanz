# Base Food Catalog (Crawled) — Design

**Date:** 2026-05-18
**Status:** Design — revised after pre-implementation review; pending implementation plan
**Scope:** Build a pre-populated, access-gated food catalog so users stop hand-entering Swiss products that Open Food Facts lacks.

> **Revision note (post-review).** This spec was rewritten after a codebase-grounded design review. Key corrections: the app is an offline-first PWA (catalog is an online, on-demand server path — **never** synced into Dexie); copy-on-use is a **net-new** instantiate action (the current OFF flow is form-prefill, not pick-to-log); `catalog_foods` **hand-lists** the 43 nutrient columns (Drizzle can't generate them); Coop is **deferred to v1.1**; the import CLI **runs on the server host**.

## 1. Goal

Every food is currently user-scoped and Open Food Facts coverage of Swiss retail products is thin, so daily logging requires tedious manual food creation. This feature ships a large pre-built **catalog** of Swiss products so that searching or barcode-scanning surfaces a ready-made product the user can **instantiate into their personal foods in one action** and then log.

The catalog is built **offline on the maintainer's machine** by a crawler kept in this repo, uploaded to the server, and imported via a CLI run **on the server host**. Access is granted per `(user, dataset)` by the maintainer — it is not visible to all users automatically.

## 2. Non-goals

- Committing any crawled data to the repository (public repo → that would be public redistribution). Crawler _code_ ships; crawled _data_ never does.
- Rehosting retailer images (store the source URL only, as the current OFF flow does).
- Automatic/scheduled re-crawl or live retailer calls from the app runtime. Refresh is a manual CLI re-import.
- **Coop in v1** — deferred to v1.1 (most fragile source; see §11).
- **Live link between a copied food and its catalog origin.** A personal food instantiated from the catalog is a point-in-time **snapshot**; later catalog re-imports do not update it (same semantics as the current OFF prefill). Explicit non-goal.
- **In-app admin role or admin UI.** There is no `users.role` concept and none is added. The only "maintainer" is whoever can SSH the server host and run the CLI; access grants are CLI-only.
- Cross-dataset canonical product merge, fuzzy non-barcode dedup.
- MCP changes beyond catalog results appearing in existing tools (server-side, `userId`-gated). MCP stays web-only.
- Changing how personal foods work. `foods.userId` stays `NOT NULL`; catalog is a separate, read-only structure.

## 3. Scope decisions (ratified with user)

| Dimension       | Decision                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Data posture    | Crawler code in repo; dataset built locally, uploaded to server, never committed                             |
| Sources (v1)    | **Migros + Open Food Facts** (Coop → v1.1)                                                                   |
| Catalog size    | **Full food catalog** (maximize barcode hit-rate; non-food categories excluded)                              |
| Storage model   | **Separate tables + copy-on-use** — multi-dataset, with an M:N user↔dataset access map (explicit ask)        |
| Search index    | **`pg_trgm` GIN on `catalog_foods.name`** — kept; deployment is a self-hosted standard Postgres container    |
| Upload + access | **CLI run on the server host** (Docker-internal Postgres); access = a `(user, dataset)` grant row            |
| Crawler stack   | **TypeScript/Bun, no framework** — Migros via `migros-api-wrapper`, OFF via dump (Coop via Playwright, v1.1) |
| Spec/plan shape | One spec, phased implementation plan                                                                         |

## 4. Architecture

```
[ Offline — maintainer machine ]            [ Server host (SSH) ]      [ App runtime ]

crawler/                                                               src/lib/server/catalog/
  adapters/                                                              catalogSearch()  ┐ online,
    migros (migros-api-wrapper, JSON API)─┐                              catalogByBarcode()│ on-demand,
    off    (ODbL bulk dump, streamed) ────┼─►normalize                   instantiateFood() ┘ access-gated
    (coop — v1.1, Playwright)             │ (reuse src/lib                       │ (catalog_access)
  lib/ throttle·retry·cache·checkpoint    │  /nutrients.ts +                     ▼
       ·jsonl writer                      │  shared OFF              new endpoints, NOT in /api/foods,
                    │                     │  nutrient core)         NOT synced into Dexie:
                    ▼                                                  GET  /api/catalog/search
   data/catalog/<key>-<date>.jsonl ──scp──► dataset on host            GET  /api/catalog/barcode/:code
   (gitignored, Zod-validated)                     │                    POST /api/catalog/:id/save
                    ▲                              ▼                          │ → existing createFood()
        the dataset file is the seam   bun run catalog:import          ───────┘ → personal foods row
                                       (on host → Docker-internal             → syncs to Dexie normally
                                        Postgres DATABASE_URL)
                                                   ▼
                                       DB: catalog_datasets / catalog_foods / catalog_access
```

The **normalized JSONL dataset file** is the contract between offline and online halves; it is specified first (§6) so adapters and importer evolve independently. The crawler reuses `src/lib/nutrients.ts` and the dataset Zod schema directly — no cross-language reimplementation.

**Offline-first invariant (load-bearing):** the app mirrors the user's personal foods into Dexie/IndexedDB via a full-table `/api/foods` sync; `FoodPicker` filters that local array client-side. The catalog must therefore be reached through **dedicated online endpoints** (analogous to the existing online-only `/api/openfoodfacts/[barcode]`) and must **never** enter `/api/foods` or the Dexie mirror. Only a personal food _instantiated from_ a catalog row syncs to Dexie, through the normal foods path. A regression test asserts `/api/foods` never returns catalog rows.

## 5. Data model

New Drizzle tables in `src/lib/server/schema.ts`, migration `0037` (last existing is `0036`). Workflow: edit schema → `bun run db:generate` → **hand-append** the `pg_trgm` extension + GIN index SQL (drizzle-kit does not emit `CREATE EXTENSION` or `gin_trgm_ops`) → verify → let `runMigrations()` apply on dev start. This manual completion is journal-safe because `0037` is a brand-new, never-applied file (the migration-safety rule forbids editing _applied_ files / `db:push`, not completing a fresh generated migration before first apply). `0037` must never be regenerated after the manual edit.

### 5.1 `catalog_datasets`

One row per importable bundle. Identified by a stable `key` so re-imports preserve access grants.

| Column         | Type             | Notes                                         |
| -------------- | ---------------- | --------------------------------------------- |
| `id`           | uuid pk          | `defaultRandom()`                             |
| `key`          | text unique      | Stable, e.g. `migros`, `off-ch`               |
| `name`         | text not null    | Display name, e.g. "Migros (Switzerland)"     |
| `source`       | text not null    | `migros` \| `off` (`coop` reserved for v1.1)  |
| `priority`     | integer not null | Lower wins on cross-dataset barcode tie-break |
| `description`  | text             | Optional                                      |
| `productCount` | integer          | Set at import                                 |
| `version`      | text             | Crawler build tag                             |
| `snapshotAt`   | timestamptz      | When the crawl was taken                      |
| `createdAt`    | timestamptz      | `defaultNow()`                                |
| `updatedAt`    | timestamptz      | Bumped on re-import                           |

### 5.2 `catalog_foods`

Read-only product rows. FK → `catalog_datasets` `ON DELETE CASCADE`. Re-import replaces all rows for a dataset (batched; see §8).

- `id uuid pk`, `datasetId uuid → catalog_datasets`
- `name text not null` (the **German** name for CH retail sources — see locale note), `brand text`, `language text` (`de`\|`fr`\|`it`\|`en`, metadata only — no name translation)
- `servingSize real not null`, `servingUnit` (same enum as `foods`)
- 5 core macros (`calories`, `protein`, `carbs`, `fat`, `fiber`) — `real not null`
- The **43 extended nutrients** — `real`, nullable. **Hand-listed identically to `foods`** (`schema.ts` already hand-lists them literally because Drizzle's static type inference requires object literals — generating from `ALL_NUTRIENTS` would lose all column typing). A unit test asserts the `catalog_foods` nutrient column set is exactly `ALL_NUTRIENTS.map(n => n.dbColumn)` and matches `foods`, preventing drift.
- `barcode text` (GTIN, nullable)
- OFF-quality fields: `nutriScore text`, `novaGroup integer`, `additives text[]`, `ingredientsText text`, `imageUrl text` (source URL only — not rehosted)
- Provenance: `sourceUrl text`, `sourceRef text` (retailer product id), `crawledAt timestamptz`

**Locale note:** sources expose de/fr/it names; v1 stores the **German** name in `name` and records `language='de'` for CH retail (German is the primary locale of the user base; matches search expectations like "Gipfeli"). OFF entries keep their dump `product_name` with detected `language`.

Indexes:

- `(datasetId)`
- `(datasetId, barcode)` — barcode lookup within granted datasets
- **`pg_trgm` GIN on `name`** (`USING gin (name gin_trgm_ops)`), plus `CREATE EXTENSION IF NOT EXISTS pg_trgm;` — both **hand-appended** to `0037`. The deployment is a self-hosted standard Postgres Debian container, so `pg_trgm` is available in `contrib` and the app's DB role can create it. First-migration verification is a §13 spike.

`catalog_foods` is never mutated by the app and never logged directly.

### 5.3 `catalog_access`

M:N grant of datasets to users (explicit user requirement; kept over the reviewer's YAGNI suggestion so the maintainer can grant specific datasets to specific people).

- `userId uuid → users` (`ON DELETE CASCADE`)
- `datasetId uuid → catalog_datasets` (`ON DELETE CASCADE`)
- `grantedAt timestamptz default now()`
- Composite primary key `(userId, datasetId)`

A user sees catalog rows only from datasets they have a grant for. Grants survive re-import because `catalog_datasets.id` is stable per `key`.

## 6. Normalized dataset file format

JSONL (streamable for tens of thousands of rows). Defined once as a Zod schema in `src/lib/server/catalog/dataset-schema.ts`, **shared by crawler output and import validation**.

- Line 1: header record `{ "_dataset": { "key", "name", "source", "priority", "version", "snapshotAt" } }`
- Lines 2..n: one product per line, fields = `catalog_foods` columns minus ids/timestamps, nutrients per 100 g.

The importer is **fail-closed**: any line failing schema validation aborts the whole import (a partial bad dataset is worse than none). Rows missing required core macros are dropped at normalization time with a logged count (not an abort).

## 7. Crawler pipeline

Location: `crawler/` (top-level; **not** part of the SvelteKit app, its build, or `bun run security` scope — see §10). TypeScript run with Bun. Output: `data/catalog/<key>-<date>.jsonl`.

### 7.1 Adapter contract

```ts
interface SourceAdapter {
	key: string; // dataset key
	crawl(opts): AsyncIterable<RawProduct>; // source-specific
}
```

A shared normalizer maps `RawProduct → DatasetProduct` (the Zod schema), reusing `ALL_NUTRIENTS` keys/units and `offConversion` from `src/lib/nutrients.ts`. Each adapter is independently testable against recorded fixtures (no live network in CI).

### 7.2 Source adapters

- **Migros (v1)** — depend on the `migros-api-wrapper` npm package (TS, MIT, maintained: `onesearch` v5 search → `product-display /v2/product-detail`, guest-token handling). Page through the food category tree; map the nutrition table → normalized nutrients. Whether it exposes all 43 nutrients or only core macros is a §13 spike. Pin the version exactly.
- **Open Food Facts (v1)** — download the ODbL **bulk dump**, stream-parse, filter to Swiss/relevant + food categories. **Reuse scope (corrected):** extract only the pure nutrient core from `src/lib/server/openfoodfacts.ts` — the `extractNutrient` + `ALL_NUTRIENTS` loop (dependency-free apart from `zod` + `$lib/nutrients`) — into a shared helper used by both the live API route and the crawler. The existing `mapSearchProduct` is **unexported and coupled to the live v2 API field shape**; the bulk dump has a different structure and needs its own product-shape adapter. Do not "reuse the mapper" wholesale.
- **Coop (v1.1, deferred)** — no public API; Playwright (already a repo dependency): walk the food category tree, prefer the page's internal XHR JSON over DOM. Most fragile → separate follow-up effort, not v1.

### 7.3 Crawl guardrails (`crawler/lib/`)

Polite fixed-delay + per-host concurrency cap; exponential-backoff retry; on-disk response cache keyed by request (cheap, resumable re-runs); checkpoint of last completed page/category; descriptive `User-Agent`; structured progress logging.

## 8. CLI & operations

`bun run` scripts under `scripts/` (consistent with existing `scripts/*.ts`, which already use `DATABASE_URL` + `postgres()` + `drizzle()`).

**Operational model (decided): run on the server host.** Production Postgres is Docker-internal. Workflow:

1. Build the dataset locally (crawler).
2. `scp` the `*.jsonl` file to the server host.
3. SSH into the host; run the CLI inside the app container against the Docker-internal `DATABASE_URL` (e.g. `docker compose exec app bun run catalog:import /data/<file>.jsonl`, dataset file mounted/copied in). Exact container invocation confirmed during planning against the `docker-server` compose setup.

CLIs:

- `catalog:import <file.jsonl>` — validate every line with the dataset Zod schema (fail-closed); upsert `catalog_datasets` by the header `key`; **fully replace** that dataset's `catalog_foods` (a dataset import is always a complete snapshot of that dataset — there is no partial/append mode; other datasets are untouched). **Bulk strategy:** within a transaction, `DELETE` the dataset's rows, then **chunked multi-row INSERT (e.g. 1–5k rows/statement)**; drop the `pg_trgm` GIN index before the bulk load and recreate it after (avoids per-row GIN maintenance at tens-of-thousands scale). Set `productCount`/`snapshotAt`.
- `catalog:grant <userEmail> <datasetKey>` / `catalog:revoke <userEmail> <datasetKey>` — manage `catalog_access`.
- `catalog:list` — datasets, product counts, who has access.

No new HTTP surface. Admin identity = SSH + DB access on the host (no in-app role).

## 9. App integration

The app is an offline-first PWA (see §4 invariant). Catalog access is therefore **online, on-demand, server-side**, mirroring the existing OFF online path — **not** an extension of `listFoods()` and **not** part of the Dexie-synced `/api/foods` payload. The user-facing "pick a result and log it" is **net-new** (the current OFF flow is barcode→navigate to `/foods`→prefill the create form→manual save; there is no pick-to-log today — so this is built, not inherited).

New module `src/lib/server/catalog/` + endpoints:

- `GET /api/catalog/search?q=&limit=` — trigram/`ILIKE` search over `catalog_foods` restricted to the requesting user's granted datasets; returns rows tagged with `datasetKey`/`source`. Own limit/offset; **does not** alter `listFoods()` `{ items, total }` semantics.
- `GET /api/catalog/barcode/:code` — barcode lookup across the user's granted datasets. Cross-dataset tie-break: if multiple granted datasets contain the barcode, return the row from the **lowest `catalog_datasets.priority`** (e.g. Migros < OFF).
- `POST /api/catalog/:id/save` — the explicit copy-on-use action: instantiate a personal `foods` row from the catalog row via the existing `createFood`/insert path (server-side, `userId`-gated by the row's dataset grant), return the new food. It then syncs to Dexie normally and is logged through the existing food path. Catalog rows are never mutated or logged directly.

UI (minimal):

- `FoodPicker` search tab: local Dexie filter unchanged; when the user has any catalog grant, additionally issue a **debounced online** `GET /api/catalog/search` and render those results below personal results with a small **source badge** (e.g. "Migros"). Selecting a catalog result calls `POST /api/catalog/:id/save`, then proceeds to log the returned personal food. Client-side merge is personal-first; no server union, so the foods hot path is untouched.
- Barcode scan miss path: query `GET /api/catalog/barcode/:code` **before** the existing OFF fallback; on hit, offer save+log.

MCP: `search_foods` / `find_food_by_barcode` handlers additionally consult the catalog (server-side, `userId`-gated via `catalog_access`); results carry `source`. Logging a catalog result through MCP performs the same server-side instantiate first. No new MCP tools; MCP stays web-only.

## 10. Legal & operational guardrails

- `.gitignore` `data/catalog/`; a `repo: local` prek hook (matching the project's all-`repo: local` `.pre-commit-config.yaml`) rejects committing `*.jsonl` under it.
- The legal posture is **private use by this app's authenticated user base + no redistribution** (no data committed; access-gated). The crawler hitting Migros's guest-token endpoints is _not_ presented as sanctioned — the defense is private use and non-redistribution, stated in `crawler/README.md`. Polite throttling + caching.
- The crawler lives in `crawler/` outside `src/` and outside the app build; nothing in `src/` imports it. Confirm `bun run security` / `bun audit` scoping does not fail CI on crawler-only deps (e.g. `migros-api-wrapper`'s axios/cheerio/pino transitive tree); pin the dependency exactly. If the security suite scans the whole tree, add the documented-exception pattern used for the existing accepted `minimatch` exception.
- Provenance (`source`, `sourceUrl`) stored per row and surfaced via the badge.

## 11. Build sequence (phased plan)

**v1:**

1. **Schema + dataset format + CLIs** — migration `0037` (with hand-appended `pg_trgm`), drift-guard test, `catalog:import/grant/revoke/list`; proven end-to-end with a tiny hand-written JSONL fixture (no crawler yet).
2. **App integration** — `src/lib/server/catalog/` + the three endpoints, `FoodPicker`/barcode UI, MCP, and tests; full user-facing value against fixture data (no crawler yet).
3. **OFF adapter** — bulk-dump download/filter + shared nutrient-core extraction.
4. **Migros adapter** — spike `migros-api-wrapper` coverage, then adapter.

**v1.1:** 5. **Coop adapter** — Playwright, internal-XHR-first, isolated.

Phases 1–2 deliver the entire UX against fixtures; 3–4 are independent source plug-ins landing in any order.

## 12. Testing strategy

- Dataset Zod schema: valid/invalid lines, header record.
- Drift guard: `catalog_foods` nutrient columns ≡ `ALL_NUTRIENTS[].dbColumn` ≡ `foods` nutrient columns.
- Nutrient normalizer: per-source recorded-fixture → expected `DatasetProduct` (unit conversions).
- Import CLI: integration test (Testcontainers, `vitest.integration.config.ts`) — upsert-by-key, batched replace, GIN drop/recreate, grant survival across re-import, fail-closed on a bad line.
- Endpoints: access gating (granted vs non-granted user) on `/api/catalog/search` & `/barcode`; cross-dataset `priority` tie-break; `POST /api/catalog/:id/save` creates a personal food and never mutates `catalog_foods`.
- **Offline invariant:** `/api/foods` never returns catalog rows; the Dexie mirror is unaffected by catalog presence.
- Adapters: fixture-driven unit tests only.

## 13. Open implementation spikes (resolve during planning)

- Migros food-category traversal + nutrition field coverage via `migros-api-wrapper` (all 43 nutrients, or only core macros?).
- OFF **bulk-dump** field shape/size and the Swiss/food filter predicate (distinct from the live v2 API shape).
- Exact server-host container invocation for the CLI against the `docker-server` compose setup.
- First-migration verification that `CREATE EXTENSION pg_trgm` succeeds as the app's DB role in the deployment container (expected: yes — standard Debian Postgres image).

## 14. Risks

- **Migration `0037` is hand-completed** (extension + raw GIN). Mitigation: it's a fresh never-applied file (journal-safe); documented "do not regenerate"; first-apply verified in the §13 spike + dev-start check per the project's migration-safety rule.
- **Catalog leaking into the offline mirror** would bloat every user's IndexedDB and the user-switch wipe. Mitigation: catalog is online-only by construction (separate endpoints, never in `/api/foods`) + an explicit regression test (§12).
- **Retailer endpoint drift** (Migros). Mitigation: maintained `migros-api-wrapper`, pinned; adapters fixture-tested and isolated; Migros is one isolated phase.
- **`migros-api-wrapper` transitive dependency surface** (axios/cheerio/pino) + single-maintainer auto-publish. Mitigation: exact pin; crawler isolated from app build & security scope; reviewed on bump.
- **Bulk import performance** at tens of thousands of rows. Mitigation: chunked inserts + GIN drop/recreate in a transaction (§8).
- **Nutrient coverage gaps from sources.** Extended nutrients nullable; core macros required; rows missing required macros dropped with a logged count.
- **Coop fragility** — removed from v1 by deferring to v1.1.
