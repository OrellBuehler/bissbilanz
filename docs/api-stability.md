# API stability

From the first non-beta release on, `/api/*` and the MCP tools are a public contract.
New features must not break any client that is still in use. This document is the policy;
`scripts/api/verify.sh` and the **API Contract** workflow enforce the parts a machine can check.

## Who depends on the API

| Client                       | How it breaks                                                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android + Wear OS (KMP)      | Store builds stay installed for months. Generated Kotlin DTOs with `ignoreUnknownKeys`, so extra fields are fine; removed or retyped fields, or new required fields, are not.     |
| iOS + watchOS (SwiftUI)      | Hand-written `Codable` models. Unknown keys are fine. A missing non-optional key, a type change, or an **unknown enum value** fails decoding, and sync drops the change silently. |
| Offline queues (all clients) | Mutations recorded by an old build are replayed later, possibly after a server upgrade. Request schemas must keep accepting old payloads.                                         |
| Web PWA                      | Deployed with the server, but the service worker can keep serving an old bundle, and its Dexie queue replays old mutations too.                                                   |
| MCP clients (claude.ai, …)   | Rediscover tools on connect, but users' prompts and saved instructions name tools and parameters.                                                                                 |

## Versioning strategy

There is no URL versioning, and none is planned: `/api/*` is v1 and evolves **additively**.
All clients are first-party, so parallel `/v1` and `/v2` trees would double the maintenance
for no gain. When a change cannot be made additively, add a new endpoint or field next to the
old one (e.g. `POST /api/foods/search` beside `GET /api/foods?q=`, or `servingsCount` beside a
field whose meaning changed), migrate the clients, deprecate the old one, and remove it only
after the support window.

## What is breaking

| Safe (additive)                                          | Breaking                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| New endpoint, MCP tool or prompt                         | Removing or renaming an endpoint, field, tool, tool parameter or query parameter                |
| New **optional** request field or query parameter        | New **required** request field, or making an optional one required                              |
| New response field                                       | Making a response field optional or nullable, or dropping it                                    |
| Accepting more input (wider limits, more enum values in) | Rejecting input that used to be accepted (tighter limits, fewer enum values, stricter formats)  |
| New response enum value on a field declared extensible   | New value in a response enum (iOS `Codable` enums fail to decode it)                            |
|                                                          | Changing a field's type, format, unit or **meaning** (e.g. per-serving vs. whole-recipe macros) |
|                                                          | Changing the default applied when a field is omitted, status codes clients branch on, or auth   |

`oasdiff` catches the structural cases. **Semantic changes (units, meaning, defaults) pass the
check unnoticed**: treat them as breaking yourself and add a new field instead.

For a response enum that is meant to grow (providers, AI task statuses, …), mark it with
`x-extensible-enum` in the spec and make sure every client decodes unknown values into a
fallback case before adding values.

## Changing an existing contract: expand → migrate → contract

1. **Expand.** Add the new endpoint/field alongside the old one. The server accepts both
   shapes and fills both in responses. Ship it; no client breaks.
2. **Migrate.** Move web, Android and iOS onto the new shape. Deploy the server before the
   mobile builds that need it.
3. **Deprecate.** Mark the old operation `deprecated: true` (or `.meta({ deprecated: true })`
   on the Zod field) and add `x-sunset: YYYY-MM-DD`. The spec, generated clients and
   MCP descriptions now say so.
4. **Contract.** After the support window, when no supported build uses the old shape,
   remove it in its own PR carrying the `api-breaking-change` label.

**Support window:** an old shape stays until the oldest mobile build still in use has moved
off it, and never less than 90 days after the replacement shipped to both stores.

## Database migrations follow the same pattern

Production runs one server instance and applies migrations on start, so old _servers_ never
read the new schema, but a rollback to the previous image does. Keep migrations additive:
add a column, dual-write, backfill, switch reads, and drop the old column in a later release.
`scripts/api/check-migrations.sh` fails on `DROP`, `RENAME`, type changes, `SET NOT NULL`,
`TRUNCATE` and `DELETE FROM` in new migrations unless the file carries a
`-- destructive-ok: <reason>` line.

## What CI enforces

The **API Contract** workflow runs `scripts/api/verify.sh origin/main` on every non-draft PR:

1. **Generated artifacts are current.** It regenerates `docs/openapi.json`, the TS client
   (`src/lib/api/generated`), the Kotlin DTOs (`mobile/shared/.../api/generated`) and the MCP
   snapshot (`docs/mcp-tools.json`) and fails on any diff.
2. **No breaking changes.** `oasdiff breaking` compares both specs with the base branch and
   fails on any error-level change; the job summary shows the full changelog.
3. **No unacknowledged destructive migrations.**

Several unit tests in `tests/contract/` (Quality workflow) back it up:

- `openapi-coverage.test.ts` fails when an `/api` handler is missing from the spec, unless it
  is in the `UNDOCUMENTED` list with a reason. Undocumented routes are not protected.
- `mcp-surface.test.ts` fails when `docs/mcp-tools.json` is stale (`bun run mcp:generate`).
- `response-contract-coverage.test.ts` statically scans `tests/**/*.test.ts` for
  `expectResponseContract(...)` calls and fails when a documented operation with a 2xx JSON
  response has none, unless it is in the `EXEMPT` list with a reason.

Documenting a response shape is only half the guarantee — nothing checked that handlers
actually returned it until `tests/helpers/contract.ts`'s `expectResponseContract(method, path,
response)` closed that gap:

```ts
const response = await GET(event);
await expectResponseContract('GET', '/api/foods/{id}', response);
const data = await response.json();
```

It looks up the Zod schema `src/lib/server/openapi.ts` documents for that operation and status
code (`apiPaths`, exported for this purpose) and parses the real `Response` body against it —
clone the response before this call disturbs it, so call it before any `.json()`/`.text()` read.
It fails with the operation, status and Zod issues when the shape doesn't match, fails if the
status isn't documented for that operation at all, and for a status with no documented content
(e.g. 204) checks the body is empty instead. Every API route test in `tests/api/*.test.ts` calls
it for each documented response its test cases exercise, success and error alike; new or changed
routes should do the same — see "API Routes" in `CLAUDE.md`.

### Shipping an intentional break

Only for the contract step above, or for a security fix with no additive alternative:

1. Explain in the PR description what breaks, which client versions are affected, and why
   they are no longer in use (or why breaking them is acceptable).
2. Add the `api-breaking-change` label. The workflow re-runs and passes, still listing the
   breaking changes in its summary.

## Not yet in place

In rough priority order:

1. **Client version header + minimum supported version.** No client says which build it is,
   so we cannot tell when an old shape is safe to remove, and we cannot ask users to update.
   Add `X-Client-Version: <platform>/<version> (<build>)` to web, Android, Wear, iOS and watchOS
   requests, record it (Sentry tag + last-seen per user), and let the server answer `426` with
   `{ error, minVersion }` below a per-platform minimum, which clients turn into an update
   prompt. Clients must ship the 426 handling **before** it is ever needed; builds without it
   can never be forced to update, so this belongs in the first non-beta release.
2. **iOS decode fixtures.** Generate example payloads from the spec and decode them in the iOS
   unit tests, so a server change that breaks Swift decoding fails CI.
