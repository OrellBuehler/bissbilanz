# Bissbilanz Catalog Crawler

Offline tool that builds **catalog datasets** (normalized JSONL) for the access-gated
base food catalog. It is **not part of the SvelteKit app**, its build, or `bun run security`
scope — nothing under `src/` imports it.

## Legal posture

- **Private use, no redistribution.** Crawler _code_ ships in this repo; crawled _data_ never
  does. Datasets are written under `data/catalog/` which is git-ignored and rejected by a
  pre-commit hook (`no-catalog-data`).
- Output is imported only into this app's database and surfaced only to its authenticated,
  individually access-granted users. It is not rehosted or redistributed.
- Retailer images are referenced by source URL only — never rehosted.
- Sources are accessed politely: fixed-delay throttling, on-disk response caching, descriptive
  User-Agent, exponential-backoff retry.

## Dataset format

One JSONL file per dataset. Line 1 is a `{ "_dataset": { ... } }` header; lines 2..n are one
product per line. The contract is the shared Zod schema
`src/lib/server/catalog/dataset-schema.ts` — the crawler validates every emitted row against it,
so a produced file always imports cleanly (`catalog:import` is fail-closed).

## Usage

```bash
cd crawler
bun install            # installs migros-api-wrapper (Migros source only)

# Open Food Facts — from a downloaded ODbL bulk dump (.jsonl or .jsonl.gz):
#   download once from https://world.openfoodfacts.org/data (openfoodfacts-products.jsonl.gz)
bun run crawl off /path/to/openfoodfacts-products.jsonl.gz
#   → writes data/catalog/off-ch-<date>.jsonl (Swiss products with full core macros)

# Migros — live API (polite, throttled):
bun run crawl migros
#   → writes data/catalog/migros-<date>.jsonl
```

The OFF dump is large (tens of GB uncompressed); the crawler streams it (gunzip + line split),
never loading it into memory. The Migros crawl is live and rate-limited — expect it to take a
while; it checkpoints progress.

## Importing on the server host

The CLI that loads a dataset into Postgres runs **on the server host** (production Postgres is
Docker-internal), not from the crawler:

```bash
scp data/catalog/migros-<date>.jsonl  server:/tmp/
ssh server
docker compose exec -T app bun run catalog:import /tmp/migros-<date>.jsonl
docker compose exec -T app bun run catalog:grant <userEmail> migros
```

Re-importing the same dataset `key` fully replaces its rows and preserves access grants.

## Testing

```bash
cd crawler && bun test
```

All tests are fixture-driven — no live network. Adapters split a pure, tested normalizer from
thin live-fetch glue; the glue (`createMigrosClient`, dump download) is exercised only by the
maintainer during a real crawl.
