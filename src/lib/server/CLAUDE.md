# Server code

`/api/*` and the MCP tools are a public contract (shipped Android/iOS builds, offline queues replaying old requests, MCP clients). Changes to `validation/`, `openapi.ts`, `mcp/`, `schema.ts` and `client-version.ts` fall under it.

- Additive only: never remove/rename a field, endpoint, tool or parameter; never add a required request field; never tighten validation on existing input; never change the meaning of an existing field.
- Migrations are expand/contract: no `DROP`/`RENAME`/type change in the release that stops using the column (`-- destructive-ok: <reason>` for a reviewed one). Never `db:push`.
- After touching routes, validation schemas or MCP tools: `bun run api:generate` (and `bun run mcp:generate` for MCP), then `scripts/api/verify.sh`.

Full rules, including response enums, deprecation flow, deploy order and forced updates: `src/routes/api/CLAUDE.md` and `docs/api-stability.md`.
