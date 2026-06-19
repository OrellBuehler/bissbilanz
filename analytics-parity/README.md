# Analytics parity (golden vectors)

The maintenance / TDEE / prediction analytics live in **two** implementations that
must stay numerically identical:

- **TypeScript** — `src/lib/analytics/` (used by the SvelteKit server and web app).
- **Kotlin** — `mobile/shared/src/commonMain/kotlin/com/bissbilanz/analytics/`
  (the shared KMP module, consumed by the Android **and** iOS apps).

`fixtures/golden-vectors.json` is a frozen, language-neutral set of
`{ fn, input, expected }` cases. Both languages run the same inputs through their
own implementation and assert the output matches `expected` within tolerance, so
any drift between the server's TS and the mobile apps' Kotlin fails CI:

- TypeScript: `tests/analytics/parity.test.ts` (vitest).
- Kotlin: `mobile/shared/src/androidUnitTest/.../AnalyticsParityTest.kt` (JVM unit test).

## Regenerating

The fixtures are generated from the **TypeScript** implementation (the server is the
source of truth for the wire-facing numbers) and then frozen:

```bash
bun run analytics-parity/generate.ts
```

This rewrites `fixtures/golden-vectors.json`. Only regenerate when an analytics
formula intentionally changes — then run the Kotlin parity test to confirm the
shared module still matches, and review the JSON diff as part of the change.
