# Bissbilanz MCP server

Bissbilanz exposes your food, weight, sleep and supplement diary as a remote
[Model Context Protocol](https://modelcontextprotocol.io) server, so Claude (or any MCP
client) can log and review your data in natural language.

| Endpoint         | `https://bissbilanz.orellbuehler.ch/api/mcp`                                               |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Transport        | Streamable HTTP (POST/GET/DELETE, `Mcp-Session-Id` sessions)                               |
| Protocol version | Negotiated by the SDK; supports `2025-11-25` down to `2024-11-05`                          |
| Auth             | OAuth 2.1 authorization code + PKCE (S256), refresh tokens                                 |
| Scope            | `mcp:access`                                                                               |
| Discovery        | `/.well-known/oauth-protected-resource/api/mcp`, `/.well-known/oauth-authorization-server` |
| Sessions         | 1 h idle TTL, max 5 concurrent per user (least recently used is evicted)                   |

## Connecting

Every user provisions their own OAuth client under **Settings → MCP** in the web app.
Dynamic client registration is intentionally not offered: the server is single-tenant per
user, and manual provisioning keeps unknown clients out.

1. Open **Settings → MCP**, copy the **Client ID** and **Client Secret** (the secret is
   shown once; regenerate it if lost).
2. Add the callback URL of the client you are connecting to **Allowed Redirect URIs**
   (for claude.ai that is `https://claude.ai/api/mcp/auth_callback`; your client shows its
   own URL when it fails the first time).
3. Add the server in the client and complete the browser authorisation prompt.

### claude.ai (web / desktop / mobile)

Settings → Connectors → Add custom connector → URL `https://bissbilanz.orellbuehler.ch/api/mcp`,
then expand _Advanced settings_ and paste the client ID and secret.

### Claude Code

```bash
claude mcp add --transport http bissbilanz https://bissbilanz.orellbuehler.ch/api/mcp
```

Then run `/mcp` inside Claude Code to authenticate. If the client asks for credentials,
use the ID/secret from Settings → MCP.

### Other clients

Any client that supports remote Streamable HTTP servers with OAuth works the same way:
point it at the endpoint, register its redirect URI, supply the client credentials.

## What the server offers

### Instructions

The `initialize` response carries server instructions that state the conventions every
tool follows — dates as `YYYY-MM-DD` in your timezone (omit for "today"), capitalised meal
types (`Breakfast`, `Lunch`, `Dinner`, `Snacks`), search-before-create, amounts in servings,
supplement logging semantics. Clients pass these to the model once.

### Tools (68)

| Area               | Tools                                                                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diary              | `get_daily_status`, `list_entries`, `log_food`, `update_entry`, `delete_entry`, `copy_entries`                                                                                                                                                                          |
| Foods              | `search_foods`, `get_food`, `create_food`, `update_food`, `delete_food`, `list_recent_foods`, `find_food_by_barcode`, `search_openfoodfacts`                                                                                                                            |
| Recipes            | `list_recipes`, `get_recipe`, `create_recipe`, `update_recipe`, `delete_recipe`                                                                                                                                                                                         |
| Goals              | `get_goals`, `update_goals`, `list_favorites`, `list_meal_types`                                                                                                                                                                                                        |
| Supplements        | `get_supplement_status`, `log_supplement`, `unlog_supplement`, `list_supplements`, `create_supplement`, `update_supplement`, `delete_supplement`, `get_supplement_history`                                                                                              |
| Weight             | `log_weight`, `get_weight`, `update_weight`, `delete_weight`, `get_maintenance_calories`                                                                                                                                                                                |
| Sleep              | `log_sleep`, `get_sleep`, `update_sleep`, `delete_sleep`                                                                                                                                                                                                                |
| Day flags          | `get_day_properties`, `set_day_properties`, `delete_day_properties`                                                                                                                                                                                                     |
| Stats              | `get_weekly_stats`, `get_monthly_stats`, `get_daily_breakdown`, `get_meal_breakdown`, `get_top_foods`, `get_streaks`, `get_calendar_stats`                                                                                                                              |
| Analytics          | `get_food_diversity`, `get_meal_timing`, `get_sleep_food_correlation`, `get_weight_food_series`, `get_extended_nutrients`, `get_daily_nutrients`                                                                                                                        |
| Nutrition planning | `get_nutrient_gaps`, `find_nutrient_sources`, `get_eating_patterns`, `get_meal_plan_context` — micronutrient shortfalls against IOM references, the foods that close them, eating habits, and one bundle for building a plan                                            |
| AI task queue      | `list_ai_tasks`, `get_ai_task`, `complete_ai_task`, `dismiss_ai_task` — meal photos (up to five per task) and descriptions queued from the apps for an agent to process; each task carries the meal's date, type and `eatenAt` (the queue time unless the user set one) |
| Food labels        | `list_unlabeled_foods`, `list_labels`, `set_food_labels`, `set_food_labels_batch` — see [Food labels](#food-labels)                                                                                                                                                     |

Every tool carries `readOnlyHint`/`destructiveHint`/`idempotentHint` annotations and a
display `title`. Results are returned as a JSON text block plus `structuredContent`; tools
with a stable object contract (`get_daily_status`, `log_food`, `delete_entry`,
`list_entries`, `get_goals`, `get_streaks`, `get_weekly_stats`, `get_monthly_stats`,
`get_supplement_status`, `list_meal_types`, `get_maintenance_calories`, `get_nutrient_gaps`,
`find_nutrient_sources`, `get_eating_patterns`, `get_meal_plan_context`) also publish an
`outputSchema`. Failures come back as `isError` results with `{ "error": "…" }` (plus
`issues[]` for validation failures), never as JSON-RPC errors.

### Prompts

| Prompt          | Arguments                           | What it does                                                                       |
| --------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `log_meal`      | `description`, `mealType?`, `date?` | Free-text meal → search / create / `log_food` → summary with remaining budget      |
| `daily_review`  | `date?`                             | Totals vs goals, gaps, untaken supplements, one or two foods to close the gap      |
| `weekly_review` | `endDate?`                          | Seven-day averages, consistency, weight trend, top foods, one change for next week |
| `label_foods`   | `limit?`, `minLabels?`              | Sweep the food database and label every unlabelled or thinly labelled food         |
| `meal_plan`     | `startDate?`, `days?`, `focus?`     | Context → gaps → sources → a multi-day plan built around existing habits           |

Claude Desktop and Claude Code surface these as slash commands (`/bissbilanz:log_meal …`).
`mealType` offers completions for the default meal types.

### Food labels

Labels are general **en_US** nouns for what a food physically _is_, as a camera would see
it — `banana`, `bread`, `bottle`. They exist so a phone can find a food from a camera
frame, which is matched against that vocabulary and nothing else. **Labels stay English
whatever the food is named in:** a food called `Banane` must still carry `banana`, or it
can never be matched.

Packaged products label themselves: every barcode scan already fetches the product's Open
Food Facts `categories_tags`, and a create or enrich that forwards them as
`categoriesTags` seeds `catalog` labels from the object-like slugs (`en:colas` → `cola`,
`en:sliced-breads` → `sliced bread`; merchandising paths like
`en:cereals-and-their-products` are dropped). `find_food_by_barcode` and
`search_openfoodfacts` return the tags; pass them to `create_food` verbatim. That covers
barcoded goods only — fresh produce and home-cooked food need the labeller below.

The server ships the socket, not the labeller: run `label_foods` from any client with an
LLM subscription and it pages `list_unlabeled_foods`, applies the contract above, and
writes back with `set_food_labels_batch` until the database is labelled. Pass
`minLabels` (to the prompt or the tool) to also revisit foods carrying fewer than that
many labels — `list_unlabeled_foods` returns what each food already has, and the batch
write extends by default, so a second sweep adds rather than repeats. `list_labels` shows
the vocabulary in use with per-label food counts, so a sweep stays consistent. The same thing is
reachable over REST (`GET /api/foods?minLabels=n` for foods carrying fewer than `n`
labels, `PUT /api/foods/{id}/labels`, `POST /api/foods/labels`, and
`GET /api/foods/labels` for the vocabulary with per-label food counts) for a local
classifier or a third-party tool.

Labels are also a search tier: `GET /api/foods?q=` matches the name first, then the
English labels, then the brand, then trigram-similar names, in that order — so `bread`
finds a food named `Vollkornbrot` once it is labelled.

Writes are **replace-by-source** by default: a write for one source replaces exactly that
source's rows. With `mode: "extend"` a write only adds to them, so a second sweep can never
shrink a set it did not fully re-derive. The 20-per-food cap is hard either way: labels
that do not fit next to what is already stored come back as `dropped` instead of pushing
older rows out. MCP writes are forced to source `llm`, so an agent can never delete or overwrite a
label the user set by hand — while an explicit user write (source `user`, the default over
REST) is the whole set and replaces every source, so a seeded label the user removed
never comes back. Labels are normalized server-side (lowercased, accent-folded,
singularized, deduped, max 3 words / 40 characters, max 20 per food); anything that cannot
be a general en_US noun is dropped rather than stored. Every food read carries the result
back as a flat `labels` array.

### Resources

Static: `diary://today`, `status://today`, `goals://current`, `favorites://list`,
`recipes://list`, `supplements://list`, `supplements://status`, `weight://latest`,
`stats://weekly`, `stats://monthly`, `streaks://current`.

Templates: `diary://{date}`, `status://{date}`, `food://{foodId}`, `recipe://{recipeId}`,
`weight://{from}/{to}`.

All resources are `application/json`.

## Limits and behaviour

- Requests are rate-limited per user; a `429` JSON-RPC error means back off.
- Sessions live in server memory. After a deploy, the client receives `404 Session not
found` and must re-initialise (all mainstream clients do this automatically).
- Tokens can be revoked per connected application under **Settings → MCP → Connected
  Applications**; regenerating the client secret revokes every token at once.
- The server is not multi-tenant across users: a session ID is bound to the user who
  created it and rejected for anyone else.
