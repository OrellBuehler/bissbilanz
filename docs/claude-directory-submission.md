# Claude Connectors Directory submission

Everything the developer portal asks for when listing Bissbilanz as an MCP connector.
Submit at <https://claude.ai/directory/manage> (**Submit new → MCP connector**); the
requirements are described in the
[submission guide](https://claude.com/docs/connectors/building/submission) and the
[authentication guide](https://claude.com/docs/connectors/building/authentication). Any paid
Claude plan can submit. For escalations: mcp-review@anthropic.com.

Nothing secret lives in this file: the repository is public. Credentials for the reviewer
account are pasted into the portal only.

When the listing is approved, set `CLAUDE_DIRECTORY_URL` in `src/lib/mcp-connect.ts` (and the
matching constants in the Android and iOS connect screens) to the
`https://claude.ai/directory/connectors/<slug>` page. The apps and the web settings page
then send people there instead of the prefilled custom-connector dialog.

## 1. Connection

| Field          | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| Server URL     | `https://bissbilanz.orellbuehler.ch/api/mcp` (one universal URL, HTTPS)     |
| URL variations | None: choose the universal URL option. Self-hosters use their own instance. |
| Transport      | Streamable HTTP                                                             |

## 2. Tools

Synced automatically from the server: 70 tools, 6 prompts and the resources listed in
[mcp.md](mcp.md). Every tool has a `title` and a `readOnlyHint` / `destructiveHint` /
`idempotentHint` annotation (`src/lib/server/mcp/server.ts`), so the portal should flag
nothing. `docs/mcp-tools.json` is the generated snapshot of the surface.

## 3. Listing

| Field               | Value                                                                               |
| ------------------- | ----------------------------------------------------------------------------------- |
| Server name (100)   | `Bissbilanz`                                                                        |
| One-liner (200)     | `Log meals, weight, sleep and supplements in plain language and review your diary.` |
| Categories (1 to 5) | Health and fitness; Productivity; Food and nutrition (pick what the portal offers)  |
| Documentation URL   | `https://bissbilanz.orellbuehler.ch/help/ai-assistant` (public, no login)           |
| Privacy policy URL  | `https://bissbilanz.orellbuehler.ch/privacy`                                        |
| Support contact     | `https://bissbilanz.orellbuehler.ch/support` (also `me@orellbuehler.ch`)            |
| Icon                | `static/icon-512.png` (512x512 PNG); the vector source is `static/icon.svg`         |
| URL slug            | `bissbilanz` (permanent once published)                                             |

Description (2,000 characters max):

```
Bissbilanz is a personal food diary for calories and macros. Connect it to Claude and
just say what you ate: Claude finds the foods in your own database, estimates the
portions, logs the entries and tells you how much of your daily budget is left.

What you can do
- Log meals in natural language, by food, recipe or one-off estimate
- Look up foods and barcodes, including Open Food Facts products
- Check today's calories and macros against your goals, and see weekly and monthly trends
- Track body weight, sleep and supplements, and see the maintenance calories your data implies
- Review streaks, top foods, eating patterns and nutrient gaps, and plan meals around them
- Work through meals you queued from the Bissbilanz apps as photos or short descriptions

How it works
Bissbilanz is a free, open-source app for the web, Android and iPhone. This connector reads and
writes only the diary of the account you sign in with. You approve access once on a Bissbilanz
consent page and can revoke it at any time under Settings -> MCP -> Connected Applications.

Requires a free Bissbilanz account (sign in with Google, Apple or Infomaniak).
```

## 4. Use cases

- **Primary use cases:** log a meal by describing it; ask how the day or week is going
  against goals; log weight, sleep and supplements; process meals queued from the apps as
  photos; plan meals around nutrient gaps.
- **What users need before connecting:** a free Bissbilanz account (web or mobile app). No
  paid plan, no API key. The first sign-in happens in the browser during the OAuth consent.
- **Reads, writes or both:** both. Read tools never modify anything. Write tools create,
  update or delete the signed-in user's own diary entries, foods, recipes, goals, weight,
  sleep, supplements and AI tasks.

## 5. Company

| Field             | Value                                               |
| ----------------- | --------------------------------------------------- |
| Company name      | Orell Buehler (individual developer, Switzerland)   |
| Website           | `https://bissbilanz.orellbuehler.ch`                |
| Primary contact   | `me@orellbuehler.ch`                                |
| Source repository | `https://github.com/OrellBuehler/bissbilanz` (open) |

## 6. Authentication

| Field                | Value                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Mode                 | OAuth 2.0 with Client ID Metadata Documents (`oauth_cimd`). No dynamic client registration, no Anthropic-held credentials.                 |
| Token auth method    | `none`: Claude is a public PKCE client (S256) at the token endpoint; there is no client secret.                                            |
| Callback URL         | `https://claude.ai/api/mcp/auth_callback`                                                                                                  |
| Authorization server | `https://bissbilanz.orellbuehler.ch/.well-known/oauth-authorization-server`                                                                |
| Protected resource   | `https://bissbilanz.orellbuehler.ch/.well-known/oauth-protected-resource/api/mcp` (also served at `/.well-known/oauth-protected-resource`) |
| Scope                | `mcp:access`; `offline_access` is accepted and refresh tokens are always issued                                                            |

Notes for the reviewer:

- The metadata advertises both values Claude requires for CIMD:
  `client_id_metadata_document_supported: true` and `none` in
  `token_endpoint_auth_methods_supported`. `registration_endpoint` is intentionally absent.
- Claude identifies itself with its published client ID metadata URL. The Bissbilanz consent
  page names the client, the host that served the metadata document and the redirect target.
- Authorization responses (approval and denial) carry the RFC 9207 `iss` parameter, and the
  metadata advertises `authorization_response_iss_parameter_supported`.
- Unauthenticated requests to `/api/mcp` return `401` with a `WWW-Authenticate` header that
  points at the protected-resource metadata.
- Access tokens expire; refresh tokens rotate. Revoking a client under Settings -> MCP ->
  Connected Applications drops every token it holds.

## 7. Data handling

- **Underlying API:** first party. Bissbilanz is the author and operator of the API; food
  barcode lookups additionally query Open Food Facts (public, open data) on the user's behalf.
- **Personal health data:** yes, answer it as handled. The diary holds food intake, body
  weight, sleep and supplement logs the user enters. It is not medical-record data, there is
  no diagnosis or clinical data, and nothing is sold, used for advertising or shared with third
  parties (see the privacy policy). Data returned to Claude is processed by Anthropic under
  its terms, which the privacy policy states explicitly.
- **Sponsored content:** none.

## 8. Test and launch

Tell the reviewer in the portal:

```
Bissbilanz is a personal food diary. The connector reads and writes the diary of the
signed-in Bissbilanz user.

1. In Claude open Settings -> Connectors (Customize -> Connectors on the web) and add the
   listing. If you add it as a custom connector instead, use
   https://bissbilanz.orellbuehler.ch/api/mcp and leave the OAuth client on
   "Use Claude's published identity".
2. Click Connect. A Bissbilanz page asks you to sign in. Use the reviewer account below
   (choose the provider named there), then click Approve on the consent page.
3. Ask Claude: "What did I eat today and how much of my budget is left?" (get_daily_status),
   "Log a banana and a coffee with milk for breakfast" (search_foods, log_food) and
   "Log my weight as 72.4 kg" (log_weight).

The account is pre-populated with foods, recipes, a week of diary entries, weight and
sleep logs and supplements, so every read tool returns data.
```

Reviewer credentials (portal only, never in this repository):

- Use the dedicated store-review account that already exists for the app stores
  (`store/review-notes.md`: an Infomaniak account seeded with entries, credentials in
  1Password), or create a second one as described below.
- To create a demo user: sign in to the web app once with a fresh Infomaniak or Google account,
  then fill it by hand or with the app's CSV import (`docs/import.md`) so it has a week of
  entries, a few recipes, weight and sleep logs and one or two supplements. Do not reuse a
  personal account. After approval, rotate the password and delete the account's diary data if
  the account is no longer needed.
- The reviewer must be able to sign in without a second factor tied to a personal device.
- Confirm in the portal that you ran every tool yourself: add the server as a custom connector
  in Claude (or use MCP Inspector) and call each tool once, ideally with the demo account.

## 9. Compliance acknowledgments

All seven are required. Answers for Bissbilanz:

| Acknowledgment               | Position                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Directory guidelines         | Compliant. Read-only and destructive tools are annotated; descriptions match behavior.                                                               |
| First-party API usage        | The connector uses Bissbilanz's own API. Open Food Facts is queried for barcode lookups, an open-data API that permits it.                           |
| Financial transactions       | None. No payments, purchases or money movement.                                                                                                      |
| AI media generation          | None. Tools return diary data; meal photos queued by the user are returned as images for the assistant to read, never generated.                     |
| Prompt injection             | Tool results contain user-entered text (food names, notes, queued descriptions). The server treats it as data and never executes it as instructions. |
| Conversation data collection | The server never receives or stores the conversation, only the tool arguments Claude sends. No conversation logging, no analytics on tool content.   |
| Public documentation         | The help article above is public and describes setup, capabilities and revoking access.                                                              |

## 10. Pre-submission checklist

- [ ] `curl https://bissbilanz.orellbuehler.ch/.well-known/oauth-authorization-server` shows
      `client_id_metadata_document_supported`, `none` and `authorization_response_iss_parameter_supported`
- [ ] `curl -i -X POST https://bissbilanz.orellbuehler.ch/api/mcp` returns `401` with `WWW-Authenticate`
- [ ] Help article, privacy policy and support pages load without signing in
- [ ] Added the server as a custom connector in Claude and called every tool
- [ ] Demo account populated; credentials ready for the portal (not in this repo)
- [ ] After approval: set the directory URL constants on web, Android and iOS, and release
