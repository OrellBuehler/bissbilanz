# Bissbilanz Food Package Crawler

Offline tool that builds **`.bissbilanz` food packages** from public food sources. It is
**not part of the SvelteKit app**, its build, or `bun run security` scope — nothing under
`src/` imports it at runtime (tests import the app's package reader to prove the output is
readable).

Each run writes **one big package per source** (never split), with the product photos embedded.
Packages of 30k–100k foods and 0.5–2 GB are expected. The phone apps import these packages
natively (with background sync; being built in parallel PRs) — the web importer's 50 MB / 5000
food limits do not apply to packages produced here.

The server-side catalog import (`scripts/catalog.ts`, `catalog:import`, `catalog:grant`) is **no
longer fed by the crawler**. The old catalog-dataset JSONL output was removed.

## Sources and licensing

| Source                           | Command  | License / terms                                                                                                                                                      |
| -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open Food Facts (Swiss products) | `off`    | Data: ODbL 1.0, contents: DbCL 1.0. Images: CC BY-SA 3.0. Attribution required, share-alike for derived databases. The package `README.txt` carries the attribution. |
| BLV Swiss Food Composition DB    | `blv`    | Free to use with source attribution ("Swiss Food Composition Database, FSVO", <https://naehrwertdaten.ch>). Attribution is in the package `README.txt`.              |
| Migros                           | `migros` | **Private use, no redistribution.** The package contains Migros product data and images; keep it to yourself and never publish it.                                   |

Crawler _code_ ships in this repo; crawled _data_ never does. Output goes to `data/catalog/`
(relative to where you run it, i.e. `crawler/data/catalog/`), which is git-ignored, along with
the image cache, and rejected by the `no-catalog-data` pre-commit hook.

Sources are accessed politely: throttled requests, on-disk caching, descriptive User-Agent,
exponential-backoff retry.

## Package format

A zip file (ZIP64 when it has more than 65,535 entries) named `<source>-<YYYY-MM-DD>.bissbilanz`:

- `README.txt` — source name, date, food count, attribution and license text.
- `bissbilanz-foods.json` — manifest `{ format: "bissbilanz.food-package", formatVersion: 1, exportedAt, foods, recipes: [] }`.
  Foods are `f1..fN`, role `selected`, per 100 g/ml values (`servingSize: 100`), labels = the source
  name plus category labels where the source has categories (BLV).
- `images/<ref>.webp` — 400×400 WebP (cover crop, quality 80, same as the app's thumbnails),
  stored uncompressed. A food whose image could not be fetched or decoded is still emitted,
  keeping its `imageUrl`; the failure reasons are printed at the end of the run.

The contract is the app's `foodPackageManifestSchema` (`src/lib/server/validation/food-package.ts`).
The crawler does not import it at runtime (it drags in the database layer); the few constants are
copied into `lib/package-writer.ts` and the tests round-trip the output through the app's real
reader (`readFoodPackage`).

Memory stays flat: foods are spooled to a temp NDJSON file (`<package>.parts/`) as they are
crawled, then the manifest is streamed into the zip and images are added one at a time.

## Usage

```bash
cd crawler
bun install

# Open Food Facts — from a downloaded ODbL bulk dump (.jsonl or .jsonl.gz):
#   download once from https://world.openfoodfacts.org/data (openfoodfacts-products.jsonl.gz)
bun run crawl off /path/to/openfoodfacts-products.jsonl.gz
#   → data/catalog/off-<date>.bissbilanz (Swiss products with full core macros, with images)

# BLV Swiss Food Composition Database (~1,250 foods, German names, no images):
bun run crawl blv                 # downloads the current xlsx from naehrwertdaten.ch
bun run crawl blv /path/to/Schweizer_Nahrwertdatenbank.xlsx   # or use a local copy
#   → data/catalog/blv-<date>.bissbilanz

# Migros — live API (polite, throttled, resumable):
bun run crawl migros
#   → data/catalog/migros-<date>.bissbilanz

# Flags
bun run crawl migros --limit 5    # cap the number of foods (use it to validate a source first)
bun run crawl off dump.jsonl.gz --no-images   # skip downloading and embedding images
```

The OFF dump is large (tens of GB uncompressed); the crawler streams it (gunzip + line split),
never loading it into memory. Image downloads are cached in `data/catalog/.cache/` so a re-run
does not refetch. The Migros crawl is live and rate-limited and checkpoints progress
(`data/catalog/.migros-checkpoint.json`); an interrupted run resumes with the same command and
keeps the foods already collected.

The Migros crawl needs a guest OAuth2 token (public, no login): `GET /authentication/public/v1/api/guest`
returns it in the `leshopch` response header, and every product call sends it back as a `leshopch`
request header (the client renews it on a 401). Requests also need a User-Agent; one without it is
answered with a Cloudflare 403. There is no category browse endpoint (search requires a query), so
the crawler scans the product id space `100000000..~100230000` through
`product-display/public/v2/product-detail` (100 ids per call, one call per 600 ms, ~2,300 calls)
and keeps products whose root category (`breadcrumb[0]`, `MIGROS_FOOD_ROOTS` in `index.ts`) is a
food or drink category. Each food gets the source label plus a short German root-category label.
The checkpoint cursor is the next id to scan, so a resumed run does not duplicate foods.
Nutrition comes from the German `nutrientsTable` (first column, `100 g` or `100 ml`; kcal read
from `287 kJ (69 kcal)`, kJ / 4.184 as fallback). Products without a nutrition table, with a
prepared/portion basis, or with a missing energy/protein/carbs/fat value are dropped; a missing
fibre row counts as 0.

BLV column mapping: BLV values are per 100 g in g/mg/µg, the same units the app stores, so they
carry over 1:1. Calories fall back to kJ / 4.184. `Sp.` (traces) and `<x` count as 0, `k.A.` as
unknown. omega-3 is the sum of alpha-linolenic acid, EPA and DHA; omega-6 is linoleic acid;
vitamin A is RAE; vitamin B3 is niacin.

## Testing

```bash
cd crawler && bun test
cd crawler && bunx tsc --noEmit
```

All tests are fixture-driven — no live network. Adapters split a pure, tested normalizer from
thin live-fetch glue; the glue (`createMigrosClient`, the OFF dump and BLV download) is exercised
only by the maintainer during a real crawl.
