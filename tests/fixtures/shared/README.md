# Shared cross-platform fixtures

Behaviour implemented on more than one platform (web TS, Kotlin shared module, Swift iOS app) is pinned by the same JSON files, asserted by all three suites:

| File                       | Web                                                 | Android / Kotlin                                    | iOS                                     |
| -------------------------- | --------------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| `goal-rules.json`          | `tests/shared-fixtures/pure-functions.test.ts`      | `SharedFixturesTest` (androidUnitTest)              | `SharedFixtureTests`                    |
| `recipe-math.json`         | same                                                | same                                                | same                                    |
| `label-parsing.json`       | same                                                | same                                                | same                                    |
| `conflict-resolution.json` | `tests/shared-fixtures/conflict-resolution.test.ts` | `SharedSyncFixturesTest` (real `SyncManager` drain) | `SharedFixtureTests.conflictResolution` |

The files are hand-maintained (expected values were produced from the web implementation and reviewed). Edit a file, then run all three suites.

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
