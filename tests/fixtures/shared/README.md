# Shared cross-platform fixtures

Behaviour implemented on more than one platform (web TS, Kotlin shared module, Swift iOS app) is pinned by the same JSON files, asserted by all three suites:

| File                       | Web                                                 | Android / Kotlin                                    | iOS                                     |
| -------------------------- | --------------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| `goal-rules.json`          | `tests/shared-fixtures/pure-functions.test.ts`      | `SharedFixturesTest` (androidUnitTest)              | `SharedFixtureTests`                    |
| `recipe-math.json`         | same                                                | same                                                | same                                    |
| `label-parsing.json`       | same                                                | same                                                | same                                    |
| `conflict-resolution.json` | `tests/shared-fixtures/conflict-resolution.test.ts` | `SharedSyncFixturesTest` (real `SyncManager` drain) | `SharedFixtureTests.conflictResolution` |

`goal-rules`, `recipe-math`, `label-parsing` and `conflict-resolution` are hand-maintained (expected values were produced from the web implementation and reviewed). Edit a file, then run all three suites.

### Generated grids

`generated-*.json` sweep the input space and are **generated from the TypeScript implementations** by `scripts/shared-fixtures/generate.ts` (the runners live in `tests/shared-fixtures/runners.ts`, the same ones the web suite asserts with). Do not edit them by hand:

```bash
bun run shared:generate   # rewrite after an intentional change to the TS behaviour
bun run shared:check      # CI: fails when a file is stale
```

| File                        | What it sweeps                                                                                  | Web                                       | Android / Kotlin                             | iOS                             |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------- | ------------------------------- |
| `generated-unit-conversion` | every serving unit to every other, three quantities                                             | `tests/shared-fixtures/generated.test.ts` | `SharedFixturesTest.generatedUnitConversion` | `SharedFixtureTests.recipeMath` |
| `generated-recipe-math`     | recipe macros across unit mixes and serving counts incl. under one serving; cooked-weight yield | same                                      | `SharedFixturesTest.generatedRecipeMath`     | `SharedFixtureTests.recipeMath` |
| `generated-goal-rules`      | outcome classification on the rule boundaries; activity-adjusted goals                          | same                                      | `SharedFixturesTest.generatedGoalRules`      | `SharedFixtureTests.goalRules`  |
| `generated-meal-types`      | meal-type normalisation, default meal by hour, canonical meal ordering                          | same                                      | `SharedFixturesTest.generatedMealTypes`      | `SharedFixtureTests.mealTypes`  |

Known cross-platform differences are recorded as `divergences` (with a reason) rather than hidden: the default meal by hour (web switches at 11/15/18 h, mobile at 5/11/14/17 h), custom meal ordering (web: order of appearance, iOS: alphabetical) and a recipe without ingredients (Kotlin returns null). Android has no shared function for meal ordering (it is inline in `DayLogScreen`), so `orderMealTypes` runs on web and iOS only.

## Schema

```jsonc
{
	"tolerance": 1e-9, // absolute tolerance for numbers
	"implementations": { "<fn>": ["web", "kotlin", "swift"] }, // who runs each fn; an unlisted fn fails
	"cases": [
		{
			"fn": "<function under test>",
			"name": "<snake_case description>",
			"input": {},
			"expected": {}, // compared on the keys it names; null equals an absent value
			"divergences": [{ "platform": "web|kotlin|swift", "expected": {}, "reason": "..." }]
		}
	]
}
```

`divergences` is the explicit known-divergence list: that platform is asserted against its own documented behaviour instead of `expected`, so the suite stays green while the difference stays visible.

`conflict-resolution.json` cases use `input: { op: update|delete|create, status, conflictHeader }` and `expected: { queue: removed|parked|retry|kept, conflictNotice: true|false|null }` (`null` = not asserted).

## Wiring

- Kotlin reads the files from `../../tests/fixtures/shared/` (relative to `mobile/shared`).
- iOS bundles `tests/fixtures/shared/*.json` and `analytics-parity/fixtures/*.json` in place through `mobile/iosApp/project.yml` (no copies).
- `AnalyticsConsistencyTests` (iOS) runs the bridged subset of `analytics-parity/fixtures/golden-vectors.json`.
