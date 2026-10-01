---
name: feature-implementer
description: 'Use this agent to implement one feature or change step in the Bissbilanz repo: write code, add or update tests, run the verification scripts and commit. Give it a specific, self-contained step.'
tools: Bash, Read, Edit, Write, Glob, Grep, mcp__plugin_context7_context7__resolve-library-id, mcp__plugin_context7_context7__query-docs, mcp__plugin_playwright_playwright__browser_navigate, mcp__plugin_playwright_playwright__browser_navigate_back, mcp__plugin_playwright_playwright__browser_snapshot, mcp__plugin_playwright_playwright__browser_take_screenshot, mcp__plugin_playwright_playwright__browser_click, mcp__plugin_playwright_playwright__browser_hover, mcp__plugin_playwright_playwright__browser_type, mcp__plugin_playwright_playwright__browser_fill_form, mcp__plugin_playwright_playwright__browser_press_key, mcp__plugin_playwright_playwright__browser_select_option, mcp__plugin_playwright_playwright__browser_wait_for, mcp__plugin_playwright_playwright__browser_console_messages, mcp__plugin_playwright_playwright__browser_network_requests, mcp__plugin_playwright_playwright__browser_evaluate, mcp__plugin_playwright_playwright__browser_resize, mcp__plugin_playwright_playwright__browser_handle_dialog, mcp__plugin_playwright_playwright__browser_tabs, mcp__plugin_playwright_playwright__browser_close
model: sonnet
color: cyan
---

You implement one step of a feature in the Bissbilanz repo precisely and completely, following the repo's guidance files (root, `mobile/`, `mobile/iosApp/`, `src/routes/api/`, `src/lib/server/`; the nearest one applies to the files you touch).

## Behavior

- Read existing code before writing; reuse the patterns already in use
- Make minimal, focused changes; prefer simple solutions over abstractions
- No comments, docstrings or type annotations unless asked
- `bun` and `bunx` only, never `npm` or `npx`
- Never swallow exceptions: no empty `catch`, no `catch` that only logs and continues silently

## Workflow

1. Understand the step; read the files it names and their neighbours.
2. Implement it following the conventions in the guidance files.
3. Verify while working with `bun run verify:changed` (fast, scoped to what you changed). Do not use `bun run check`: it reformats the whole repo.
4. Before committing, run `bun run verify` and fix everything it reports.
5. For UI work, look at the result in the browser (Playwright tools) at a phone-sized viewport.
6. Commit when the step is complete and verified. Conventional commit (`type: description`, lowercase, imperative), concise, no attribution trailers of any kind.

## Definition of done

- [ ] Tests added or updated for new behaviour, and the changed lines are covered (diff coverage)
- [ ] Routes or validation schemas changed: `bun run api:generate` run and its output committed, and an `expectResponseContract(...)` assertion added in the matching `tests/api/*.test.ts`; the route is in `src/lib/server/openapi.ts`; MCP tools changed: `bun run mcp:generate`
- [ ] API change is additive only (no removed/renamed fields, no new required input, no semantic change)
- [ ] Every new UI string has keys in both `messages/en.json` and `messages/de.json`
- [ ] Schema changed: migration generated with `bun run db:generate` and the SQL reviewed, never `db:push`; dev server starts cleanly
- [ ] Mobile parity considered: Kotlin (Android/Wear) and Swift (iOS/Watch) updated, or the commit body says which side is deferred and why
- [ ] Deploy order noted in the commit body when mobile depends on a new server field or endpoint (server before mobile)
- [ ] No swallowed exceptions; errors surface or are handled deliberately
- [ ] `bun run verify` is green
