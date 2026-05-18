# Base Food Catalog (Crawled) — Design

**Date:** 2026-05-18
**Status:** Design — pending implementation plan
**Scope:** Build a pre-populated, access-gated food catalog so users stop hand-entering Swiss products that Open Food Facts lacks.

## 1. Goal

Today every food is user-scoped and Open Food Facts coverage of Swiss retail products is thin, so daily logging requires tedious manual food creation. This feature ships a large pre-built **catalog** of Swiss products (Migros, Coop) plus Open Food Facts, so that searching or barcode-scanning surfaces a ready-made hit the user can log in one tap.

The catalog is built **offline on the maintainer's machine** by a crawler kept in this repo, exported to a file, and uploaded to production via an admin CLI. Access is granted per `(user, dataset)` by the maintainer — it is not visible to all users automatically.

## 2. Non-goals

- Committing any crawled data to the repository (public repo → that would be public redistribution). Crawler _code_ ships; crawled _data_ never does.
- Rehosting retailer images (store the source URL only, exactly as the current OFF flow does).
- Automatic/scheduled re-crawl or live retailer calls from the app runtime. Refresh is a manual CLI re-import.
- Cross-dataset canonical product merge, fuzzy non-barcode dedup, or a catalog admin web UI.
- Changing how personal foods work. `foods.userId` stays `NOT NULL`; the catalog is a separate, read-only structure.
- MCP changes beyond catalog results transparently appearing in existing tools. MCP stays web-only.

## 3. Scope decisions (ratified with user)

| Dimension       | Decision                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Data posture    | Crawler code in repo; dataset built locally and uploaded; never committed                             |
| Sources (v1)    | **Migros + Coop + Open Food Facts**                                                                   |
| Catalog size    | **Full food catalog** (maximize barcode hit-rate; non-food categories excluded)                       |
| Storage model   | **Separate tables + copy-on-use** — multi-dataset, with an M:N user↔dataset access map                |
| Upload + access | **Admin CLI** against prod `DATABASE_URL`; access = a `(user, dataset)` grant row                     |
| Crawler stack   | **TypeScript/Bun, no framework** — Migros via `migros-api-wrapper`, OFF via dump, Coop via Playwright |
| Spec/plan shape | One spec, phased implementation plan                                                                  |

## 4. Architecture

```
[ Offline — maintainer machine ]                         [ Production app ]

crawler/                                                  src/lib/server/catalog/
  adapters/                                                 ├─ catalogSearch()   ┐
    migros   (migros-api-wrapper, JSON API) ─┐               ├─ catalogByBarcode()├─ access-gated
    coop     (Playwright, internal XHR/DOM) ──┼─► normalize  ├─ copyCatalogFood() ┘  by catalog_access
    off      (ODbL bulk dump, streamed) ─────┘   (reuse        └─ surfaced through existing
  lib/  throttle · retry · resumable cache ·       src/lib/         foods.ts search / barcode
        checkpoint · jsonl writer                  nutrients.ts)    + MCP + food picker UI
                         │
                         ▼
        data/catalog/<key>-<date>.jsonl   ──►  bun run catalog:import  ──►  DB:
        (gitignored, Zod-validated)             (prod DATABASE_URL)         catalog_datasets
                         ▲                                                  catalog_foods
            the dataset file is the seam                                    catalog_access
```

The **normalized JSONL dataset file** is the contract between the offline and online halves. It is specified first (section 6) so adapters and the importer evolve independently. The crawler reuses `src/lib/nutrients.ts` and the dataset Zod schema directly — no cross-language reimplementation.

## 5. Data model

New Drizzle tables in `src/lib/server/schema.ts`, migration `0037` (last existing is `0036`). Generate with `bun run db:generate` (never `db:push`); verify SQL; let `runMigrations()` apply on dev start.

### 5.1 `catalog_datasets`

One row per importable bundle. Identified by a stable `key` so re-imports preserve access grants.

| Column         | Type          | Notes                                     |
| -------------- | ------------- | ----------------------------------------- |
| `id`           | uuid pk       | `defaultRandom()`                         |
| `key`          | text unique   | Stable, e.g. `migros`, `coop`, `off-ch`   |
| `name`         | text not null | Display name, e.g. "Migros (Switzerland)" |
| `source`       | text not null | `migros` \| `coop` \| `off`               |
| `description`  | text          | Optional                                  |
| `productCount` | integer       | Set at import                             |
| `version`      | text          | Crawler version / build tag               |
| `snapshotAt`   | timestamptz   | When the crawl was taken                  |
| `createdAt`    | timestamptz   | `defaultNow()`                            |
| `updatedAt`    | timestamptz   | Bumped on re-import                       |

### 5.2 `catalog_foods`

Read-only product rows. FK → `catalog_datasets` `ON DELETE CASCADE`. Re-import replaces all rows for a dataset in one transaction.

- `id uuid pk`, `datasetId uuid → catalog_datasets`
- `name text not null`, `brand text`, `language text` (`de` \| `fr` \| `it` \| `en`, metadata only — no name translation)
- `servingSize real not null`, `servingUnit` (same enum as `foods`)
- 5 core macros (`calories`, `protein`, `carbs`, `fat`, `fiber`) — `real not null`
- All **43 extended nutrients** — `real`, nullable — column names generated from `ALL_NUTRIENTS[].dbColumn` in `src/lib/nutrients.ts` (single source of truth; identical to `foods`)
- `barcode text` (GTIN, nullable)
- OFF-quality fields: `nutriScore text`, `novaGroup integer`, `additives text[]`, `ingredientsText text`, `imageUrl text` (source URL only — not rehosted)
- Provenance: `sourceUrl text`, `sourceRef text` (retailer product id), `crawledAt timestamptz`

Indexes:

- `(datasetId)`
- `(datasetId, barcode)` — barcode lookup within granted datasets
- **`pg_trgm` GIN index on `name`** — full-catalog `ILIKE` substring search needs it. (Per-user `foods` `ILIKE` is fine at small scale; tens of thousands of shared rows is not.) The migration must `CREATE EXTENSION IF NOT EXISTS pg_trgm`.

`catalog_foods` is never mutated by the app and never logged directly.

### 5.3 `catalog_access`

M:N grant of datasets to users.

- `userId uuid → users` (`ON DELETE CASCADE`)
- `datasetId uuid → catalog_datasets` (`ON DELETE CASCADE`)
- `grantedAt timestamptz default now()`
- Composite primary key `(userId, datasetId)`

A user sees catalog rows only from datasets they have a grant for. Grants survive re-import because `catalog_datasets.id` is stable per `key`.

## 6. Normalized dataset file format

JSONL (streamable for tens of thousands of rows). Defined once as a Zod schema in `src/lib/server/catalog/dataset-schema.ts`, **shared by crawler output and import validation** (single source of truth for the contract).

- Line 1: header record `{ "_dataset": { "key", "name", "source", "version", "snapshotAt" } }`
- Lines 2..n: one product per line, fields = `catalog_foods` columns minus ids/timestamps, nutrients per 100 g (same normalization the existing OFF mapper uses).

The importer rejects the whole file if any line fails schema validation (fail-closed; a partial bad dataset is worse than none).

## 7. Crawler pipeline

Location: `crawler/` (top-level; not part of the SvelteKit app or its build). TypeScript run with Bun. Output: `data/catalog/<key>-<date>.jsonl`.

### 7.1 Adapter contract

```ts
interface SourceAdapter {
	key: string; // dataset key
	crawl(opts): AsyncIterable<RawProduct>; // source-specific
}
```

A shared normalizer maps `RawProduct → DatasetProduct` (the Zod schema), reusing `ALL_NUTRIENTS` keys/units and `offConversion` from `src/lib/nutrients.ts`. Each adapter is independently testable against recorded fixtures.

### 7.2 Source adapters

- **Migros** — depend on the `migros-api-wrapper` npm package (TS, maintained: `onesearch` v5 search → `product-display /v2/product-detail`, guest-token handling). Page through the food category tree; map nutrition table → normalized nutrients. Inherits upstream maintenance against Migros's changing endpoints.
- **Open Food Facts** — download the ODbL bulk dump (JSONL), stream-parse, filter to Swiss/relevant + food categories, map via the existing OFF logic in `src/lib/server/openfoodfacts.ts` (refactor its mapper into a reusable function shared by the live API route and the crawler). No live API hammering.
- **Coop** — no public API. Playwright (already a repo dependency): walk the food category tree, prefer the page's **internal XHR JSON** (network response) over DOM parsing; DOM (the "Nutrition information" tab) is the fallback. Most fragile → built last, isolated.

### 7.3 Crawl guardrails (`crawler/lib/`)

Polite fixed-delay + concurrency cap per host; exponential-backoff retry; on-disk response cache keyed by request (makes re-runs cheap and resumable); checkpoint of last completed page/category; descriptive `User-Agent`; structured progress logging. ~A few hundred LOC shared across adapters.

## 8. Admin CLIs

`bun run` scripts under `scripts/` (consistent with existing `scripts/*.ts`). Connect via prod `DATABASE_URL` env. No new HTTP surface.

- `catalog:import <file.jsonl> [--replace]` — validate every line with the dataset Zod schema; upsert `catalog_datasets` by `key`; bulk-replace that dataset's `catalog_foods` in one transaction; set `productCount`/`snapshotAt`.
- `catalog:grant <userEmail> <datasetKey>` / `catalog:revoke <userEmail> <datasetKey>` — manage `catalog_access`.
- `catalog:list` — datasets, product counts, and who has access.

## 9. App integration

Mirrors the existing Open Food Facts pattern; minimal, targeted changes.

- **Search** — extend `listFoods()` in `src/lib/server/foods.ts`: also query `catalog_foods` restricted to the requesting user's granted datasets (`catalog_access`), tag results `source: '<dataset>'`, dedup against personal foods by barcode, order personal-first. Refactor the search path into a small union helper rather than rewriting it.
- **Barcode** — extend `findFoodByBarcode()`: lookup order personal → granted catalog → OFF fallback (insert catalog ahead of the existing OFF step in `src/routes/api/openfoodfacts/[barcode]/+server.ts` chain).
- **Copy-on-use** — selecting/logging a catalog result inserts a personal `foods` row via the existing create path (same behavior as picking an OFF result today). Catalog rows are never logged or mutated directly.
- **MCP** — `search_foods` / `find_food_by_barcode` transparently include granted catalog; access enforced server-side by `userId`. No new MCP tools.
- **UI** — catalog results get a small source badge (e.g. "Migros") in the existing food picker (`FoodPicker`). No new screens.

## 10. Legal & operational guardrails

- `.gitignore` `data/catalog/`; a `repo: local` prek hook rejects committing `*.jsonl` under it (belt-and-braces against accidental data commit).
- `crawler/README.md` states: data is for this app's private, authenticated user base only; not for redistribution; crawling is rate-limited and cached.
- Provenance (`source`, `sourceUrl`) stored per row and surfaced via the badge for attribution.
- Migros access uses the same guest-token endpoints the website itself uses (via `migros-api-wrapper`); Coop uses a real browser (Playwright). Polite throttling on both.

## 11. Build sequence (phased plan)

1. **Schema + dataset format + import/grant CLIs** — proven end-to-end with a tiny hand-written JSONL fixture (no crawler yet). Migration `0037`, `pg_trgm`.
2. **App integration** — search/barcode union, copy-on-use, UI badge, MCP, tests. Full user-facing value against fixture data.
3. **OFF adapter** — easiest (static dump); refactor the OFF mapper for reuse.
4. **Migros adapter** — spike `migros-api-wrapper` endpoints/coverage, then adapter.
5. **Coop adapter** — Playwright, internal-XHR-first, isolated, last.

Phases 1–2 deliver the entire capability against fixtures; 3–5 are independent source plug-ins that can land in any order.

## 12. Testing strategy

- Dataset Zod schema: unit tests (valid/invalid lines, header record).
- Normalizer: per-source recorded-fixture → expected `DatasetProduct` tests (covers nutrient unit conversions).
- Import CLI: integration test against the test DB (`vitest.integration.config.ts` / Testcontainers) — upsert-by-key, replace semantics, grant survival across re-import, fail-closed on a bad line.
- Search/barcode union: integration tests proving access gating (granted vs non-granted user) and personal-first dedup.
- Copy-on-use: a catalog pick creates a personal `foods` row and never mutates `catalog_foods`.
- Adapters: fixture-driven unit tests only (no live network in CI).

## 13. Open implementation spikes (resolve during planning/Phase 4–5)

- Exact Migros food-category traversal + nutrition field coverage via `migros-api-wrapper` (does it expose all needed nutrients, or only core macros?).
- OFF bulk-dump format/size and the Swiss/food filter predicate.
- Coop internal XHR availability vs. DOM-only; per-100g normalization quirks.

## 14. Risks

- **Retailer endpoint drift** (Migros especially) — mitigated by depending on the maintained `migros-api-wrapper` and keeping adapters fixture-tested and isolated.
- **Coop fragility / anti-bot** — mitigated by real-browser Playwright + caching; accepted that Coop may lag the other sources.
- **Catalog search performance at scale** — mitigated by the `pg_trgm` GIN index; revisit if substring search is still slow (consider FTS).
- **Accidental data commit** — mitigated by `.gitignore` + prek guard hook.
- **Nutrient coverage gaps from sources** — extended nutrients are nullable; core macros required; rows missing required macros are dropped at normalization with a logged count.
