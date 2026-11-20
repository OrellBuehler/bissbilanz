# Assistant chat: client implementation guide

The assistant chat lets a signed-in user talk to Claude about their diary. Claude runs on the
server, reads the user's data through the same tools the MCP server offers, and can change it
(log food, create foods and recipes, update goals, weight, sleep, supplements, …). This document
is the contract for the web, Android and iOS clients. The OpenAPI spec (`docs/openapi.json`, tag
`Chat`) has the exact schemas; this file explains how to use them.

Everything here is additive to the existing API. Every enum-like string in a response
(`type`, `status`, `reason`, `role`, `domain`, `code`, `blockedReason`) is declared with
`x-extensible-enum`: **decode it as a plain string and handle unknown values** (fallbacks are
given below). The generated Kotlin DTOs already use `String` for all of them; Swift models must
not use closed `Codable` enums for them.

## 1. Availability and gating

Show the chat entry point only when chat is available. The capability comes from four places,
all with the same shape (`ChatCapability`):

| Where                                             | When to read it                               |
| ------------------------------------------------- | --------------------------------------------- |
| `GET /api/preferences` → `claude.chat`            | App start / settings refresh (optional field) |
| `GET /api/chat/conversations/{id}` → `capability` | Opening a conversation                        |
| `run_finished` event → `capability`               | After every answer (budget may have run out)  |
| 403 body of `POST …/messages` → `capability`      | When a send is refused                        |

```json
{ "available": true, "remainingBudgetUsd": 8.31 }
{ "available": false, "blockedReason": "user_budget_exhausted" }
```

`blockedReason` (absent when available, may be absent when unknown): `not_configured`,
`disabled` (admin kill switch), `no_access` (user not granted), `user_budget_exhausted`,
`global_budget_exhausted`. Unknown value → treat as "not available right now". Chat needs more
budget headroom than an AI-task call, so `claude.chat.available` can be false while
`claude.available` is true. When unavailable, keep existing conversations readable (GET still
works) but disable the composer.

## 2. Authentication

Every chat route requires a **first-party** caller: the web cookie session, or a mobile bearer
token carrying the `account:manage` scope (the tokens the apps get today). Third-party MCP/OAuth
tokens get `403 { "error": "This action is not available to this token" }` (no `code`). Send the
usual `X-Client-Platform` / `X-Client-Version` headers.

**Do not send `Idempotency-Key` on chat routes.** The message id is the idempotency key (§4);
the other routes are safe to retry as they are. (If a client sends one anyway, it is accepted:
only an accepted message is stored for replay.)

## 3. Endpoints

| Method + path                                | Purpose                                         | Success                    |
| -------------------------------------------- | ----------------------------------------------- | -------------------------- |
| `GET /api/chat/conversations?limit&offset`   | List, most recently active first                | 200                        |
| `POST /api/chat/conversations`               | Create (`{ id?, title? }`, body optional)       | 201 / 200 if the id exists |
| `GET /api/chat/conversations/{id}`           | Conversation + messages + pending actions + run | 200                        |
| `PATCH /api/chat/conversations/{id}`         | Rename `{ title: string \| null }`              | 200                        |
| `DELETE /api/chat/conversations/{id}`        | Delete with everything in it                    | 204                        |
| `POST /api/chat/conversations/{id}/messages` | Send a message, start a run                     | 202                        |
| `GET /api/chat/conversations/{id}/events`    | Events after `after` (SSE or JSON)              | 200                        |
| `POST /api/chat/runs/{id}/cancel`            | Stop a run                                      | 200                        |
| `POST /api/chat/actions/{id}`                | `{ decision: "approve" \| "reject" }`           | 200                        |

Pagination of the list is `limit` (1–200, default 100) and `offset`, like the other list routes;
the response is `{ conversations: ChatConversationListItem[], total }`. Each item carries
`activeRun` (a `ChatRun` or null) and `lastSeq`.

Creating: the client may generate the conversation id (UUID) so it can create it offline-first;
re-sending the same create returns 200 with the existing conversation. An id that belongs to
another user answers `409 conversation_exists`. Without a title, the first message sets one (its
first 60 characters).

Deleting removes messages, runs, events, pending actions and the chat's copies of attached
photos. Diary changes the assistant made stay. A run working on the conversation is stopped
first; the request waits up to 10 seconds for a tool call that is executing at that moment.

All ids in paths must be UUIDs (`400 { "error": "Invalid ID format" }` otherwise). Ids of another
user's conversation, run or action always answer 404, exactly like ids that do not exist.

## 4. Sending a message

```http
POST /api/chat/conversations/83e75848-4125-4fab-b1d5-671e38b93bba/messages
{
  "id": "d0a7f2a9-8122-420c-ad0b-e2e5c29644a7",
  "text": "Log 150 g yogurt, delete the old one",
  "imageFilenames": ["5b0c….webp"],
  "context": { "date": "2026-11-18", "timezone": "Europe/Zurich", "locale": "de" }
}
```

- `id` (required): a UUID the client generates **once per message** and reuses for every retry
  of that message. Sending the same id again never creates a second message or run: the server
  answers 202 with the stored message, its run (in its current state) and its `seq`. Retry with
  the same id after a timeout or network error.
- `text`: 1–4000 characters after trimming.
- `imageFilenames` (optional): up to 5 photos the user uploaded with `POST /api/ai-tasks/photo`
  (or `/api/images/upload`), as `<uuid>.webp` or `/uploads/<uuid>.webp`. Anything that is not the
  user's own upload, is missing on the server or is over 4 MB answers `400 invalid_image`. The
  server copies each photo into the chat: the `image` parts of the user message point to the copy
  (`/uploads/<new uuid>.webp`), so replacing or deleting the original elsewhere never changes the
  conversation. A conversation holds at most 20 photos (12 MB of photo data).
- `context` (optional, recommended): `date` = the diary day the user has open (YYYY-MM-DD);
  `timezone` = the device's IANA zone (only informs the assistant; the diary keeps using the
  user's time-zone preference); `locale` = the app language (BCP 47). The assistant answers in
  `locale`, falling back to the account locale.

**202 Accepted** (`ChatMessageAcceptedResponse`): the user message, the new run
(`status: "queued"` or already `running`) and `seq`, the seq of this message's `message_created`
event. The run continues on the server even if the app goes to the background or loses the
connection; follow it with the events endpoint (§5).

Chat is **online only**: never queue a message in the offline mutation queue; show a send error
and let the user retry instead.

Errors (`ChatErrorResponse { error, code?, … }`):

| Status | `code`                   | Meaning / client action                                                                                   |
| ------ | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| 400    | (none)                   | Validation error (`details` present)                                                                      |
| 400    | `invalid_image`          | An image is not the user's upload                                                                         |
| 403    | (none)                   | Token without `account:manage`                                                                            |
| 403    | `chat_unavailable`       | Gate closed (key, kill switch, access); body has `capability`                                             |
| 403    | `budget_exhausted`       | User or global monthly budget too low; body has `capability`                                              |
| 404    | `conversation_not_found` |                                                                                                           |
| 409    | `run_active`             | A run is still `queued`/`running`: wait for `run_finished` or cancel it                                   |
| 409    | `conversation_too_long`  | 40 user messages, ~1 MB of transcript, 20 photos or 12 MB of photo data reached: offer "Start a new chat" |
| 409    | `message_id_conflict`    | The id is used by another conversation or user: generate a new id                                         |
| 429    | `daily_limit_reached`    | 60 messages in 24 hours (deleting conversations does not reset it); `Retry-After` header (seconds)        |
| 429    | (none)                   | Shared write rate limit (120 writes/min); `Retry-After`                                                   |

A run that is **waiting for a confirmation** does not block a new message: an accepted message
cancels that run (status `cancelled`, reason `superseded`; its action becomes `cancelled`, the
model is told the user did not confirm) and starts the new run. A message that is rejected (any
error above) leaves the pending confirmation untouched. Unknown `code` → show `error`
generically.

## 5. Receiving events

Every change to a conversation is an event with a `seq` that increases by exactly one per event
within the conversation (`ChatEvent`). Keep `lastSeq` per conversation (persist it with the
cached messages if you cache them).

`GET /api/chat/conversations/{id}/events?after=<lastSeq>` returns the events with `seq > after`
in order. Two ways to read it:

### 5.1 SSE (preferred while the screen is open)

Send `Accept: text/event-stream`. The response (`Content-Type: text/event-stream`) is:

```
retry: 3000

id: 3
event: text_delta
data: {"seq":3,"type":"text_delta","runId":"9eab…","messageId":"3638…","partIndex":0,"text":"Let me ","createdAt":"…"}

: ping

```

- One SSE message per event: `id` = seq, `event` = type, `data` = the `ChatEvent` JSON (same as
  in the JSON form).
- First the stored events after `after`, then new events as they happen.
- A comment line `: ping` every **20 seconds**. Set the read/idle timeout to at least **45 s**;
  if nothing (not even a ping) arrives for 45 s, reconnect.
- The server closes the stream after **10 minutes**; reconnect.
- Reconnect with `after=<lastSeq>` (or the standard `Last-Event-ID` header; the server uses the
  larger of the two). Back off (3 s, then exponential up to 30 s) on errors.
- Close the stream when the screen is closed. Opening a stream counts against the events rate
  limit (240 requests/min per user). At most **3 streams per user** stay open; a fourth closes the
  oldest one (it simply ends, like the 10-minute close).

### 5.2 JSON polling (fallback)

Any other `Accept` returns one page:

```json
{ "events": [ … ], "nextAfter": 13, "lastSeq": 13, "hasMore": false, "activeRun": null }
```

- `limit`: 1–500 (default 500). If `hasMore`, request again at once with `after=nextAfter`.
- Poll every 1–2 s while `activeRun` is `queued` or `running`, and stop (or slow to ≥ 30 s) when
  it is null or `awaiting_confirmation`. Polling has its own rate limit (240 requests/min per
  user, shared with SSE connects), separate from the write limit; 429 carries `Retry-After`.

### 5.3 Rules for applying events

1. Apply events strictly in seq order; ignore any event with `seq <= lastSeq` (duplicates after a
   reconnect); then set `lastSeq = seq`. Advance `lastSeq` past events of an unknown `type`
   without applying them.
2. Opening a conversation: `GET /api/chat/conversations/{id}` returns all messages in display form
   and `lastSeq`. The in-progress assistant message (if a run is active) already contains
   everything up to `lastSeq`. Then follow events with `after=lastSeq`.
3. `message_completed` carries the full, final assistant message: replace whatever you
   accumulated for that `messageId` with it.
4. If a gap is impossible to fill (e.g. the app was offline for days), just reload the
   conversation with GET. `text_delta` events are deleted 24 hours after they were written; the
   finished message (and `message_completed`) has the full text, so old runs replay without them.

## 6. Messages in display form

`ChatMessage { id, conversationId, role, status, reason, runId, parts[], createdAt, updatedAt }`

- `role`: `user` | `assistant` (unknown → render like assistant).
- `status`: user messages are always `completed`. An assistant message is `in_progress` while its
  run is queued, running or waiting for a confirmation, then takes the run's final status
  (`completed`, `failed`, `cancelled`, `interrupted`) and `reason` (§8). Show a hint for any final
  status other than `completed`, and for `completed` with a non-null reason.
- `parts`: ordered blocks. Render them top to bottom:

| `type`   | Fields                                                                                            | Rendering                                                                  |
| -------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `text`   | `text` (Markdown)                                                                                 | Markdown: paragraphs, lists, bold/italic, links. No tables or code needed. |
| `image`  | `url` (`/uploads/<uuid>.webp`, authenticated like other uploads)                                  | Thumbnail (user messages only)                                             |
| `tool`   | `toolUseId`, `name`, `label`, `status`, `summary`, `changed`, `changes`                           | A compact activity row with `label`; spinner while `running`               |
| `action` | `actionId`, `toolUseId`, `name`, `label`, `status`, `preview { summary, details[] }`, `expiresAt` | Confirmation card (§7)                                                     |

Unknown part `type` → skip it. `tool.status`: `running`, `ok`, `error` (show `summary`, the error
message); unknown → like `ok`. A finished message never contains a `running` tool part: a call the
run stopped during ends as `error` with a summary such as "Stopped before it finished. Check the
result." A confirmation the user rejected is an `action` part with status `rejected` and has no
`tool` part. `label` is already in the user's language
(e.g. "Logging food" / "Trage Essen ein"). Web searches and page fetches the assistant does
appear as tool parts named `web_search` / `web_fetch` ("Searching the web"); they change nothing.
A tool part can still be `running` in a final message when the run stopped during that call.

## 7. Confirmations

These calls never run without the user's approval:

- deleting an entry, food, recipe, supplement, weight or sleep entry, a day's details (water,
  activity, fasting flag, notes), a recorded fast, a reminder or a custom meal type; merging foods;
  copying a day of entries; removing a supplement log;
- changing the serving size, nutrition values or photo of a food that has diary entries;
- changing a recipe's ingredients or steps, or the servings or cooked weight of a recipe that has
  diary entries; changing a supplement's ingredients; replacing the favourite meal time windows;
- any call with a `force` flag;
- every write after the first 10 writes of one run (a "log all of these" request with many items
  asks again from the 11th on).

Everything else (logging, creating, other edits, goals, weight and sleep logs, day properties,
labels, fasts, reminders, custom meal types, other preferences) runs at once and is reported in
`changed` (§10). When the model calls a tool that needs approval, the run pauses:

1. `action_required` event with `partIndex` and the full `action` (`ChatAction`); the message gets
   an `action` part with `status: "pending"`; the run's status becomes `awaiting_confirmation`
   (no event for this; `GET` shows it as `activeRun`). `pendingActions` in `GET` lists open ones.
2. Show `preview.summary` (one line, user's language, built by the server from the current data,
   e.g. "Delete “Greek yogurt” from Breakfast on 18 Nov 2026") and `preview.details` (extra lines,
   possibly empty), with Approve and Reject buttons. The card describes exactly the call that runs:
   defaults are resolved when the card is built (copying "to today" names the day; approving after
   midnight still acts on that day), every field the call sets is listed (e.g.
   `calories: 60 → 75`, or the overrides of a merge), and fields the card cannot show are rejected
   before any card is created.
3. `POST /api/chat/actions/{actionId}` with `{ "decision": "approve" }` or `"reject"` →
   `200 { action, run }` (`run.status` is `queued`). The run resumes at once. The card is written in
   the same transaction that pauses the run, so an approval right after `action_required` always
   finds the action pending. Events follow on the stream:
   `action_resolved` (`status: approved | rejected`), `run_resumed`, then for an approval
   `tool_started`/`tool_finished` of the call itself, then the model's reply.
4. Errors: `404 action_not_found`; `409 action_not_pending` (already decided, cancelled, or the
   run ended) and `409 action_expired`, both with the current `action` in the body — refresh the
   conversation. Retrying an approve that already went through answers 409; the call never runs
   twice.

Actions expire after **60 minutes** (`expiresAt`); the run then ends `cancelled` /
`action_expired` and the action becomes `expired`. Sending a new message cancels a pending action
(§4). Cancelling the run (§8) cancels it too. Action `status` values: `pending`, `approved`,
`rejected`, `expired`, `cancelled`; unknown → treat as resolved.

## 8. Runs

`ChatRun { id, conversationId, userMessageId, assistantMessageId, status, reason, changed,
changes, createdAt, startedAt, finishedAt }`

`status`: active = `queued`, `running`, `awaiting_confirmation`; final = `completed`, `failed`,
`cancelled`, `interrupted` (unknown → treat as final). One active run per conversation.

`reason` (null while active and for a plain completion):

| status        | reason                                             | Client message idea                         |
| ------------- | -------------------------------------------------- | ------------------------------------------- |
| `completed`   | `output_limit`                                     | "The answer was cut off."                   |
| `completed`   | `iteration_limit`                                  | "The assistant stopped after many steps."   |
| `failed`      | `not_configured`, `disabled`, `no_access`          | "The assistant is not available right now." |
| `failed`      | `user_budget_exhausted`, `global_budget_exhausted` | "This month's assistant budget is used up." |
| `failed`      | `refusal`                                          | "The assistant declined this request."      |
| `failed`      | `conversation_too_long`                            | "This chat is full. Start a new one."       |
| `failed`      | `api_error`                                        | "Something went wrong. Try again."          |
| `failed`      | `internal_error`                                   | "Something went wrong. Try again."          |
| `cancelled`   | `user_cancelled`                                   | (none, or "Stopped")                        |
| `cancelled`   | `superseded`                                       | (none: the user sent a new message)         |
| `cancelled`   | `action_expired`                                   | "The confirmation expired."                 |
| `interrupted` | `server_restart`                                   | "The answer was interrupted."               |

Unknown reason → generic message for the status. After a failure the user can simply send
another message. Partial text and the tool calls that already ran are kept in the message.
Overload, rate-limit, server and connection errors (and a stalled stream: 90 s without data or 10
minutes in total) are retried up to twice by the server, but only while nothing of that answer has
streamed; `api_error` means the retries did not help or text had already arrived.
`interrupted` / `server_restart` also covers a run that stopped without a known cause (e.g. its
access was revoked and restored while it stopped). A run left by a restart is settled within about
1.5 minutes (the heartbeat goes stale after 60 s, the sweep runs every 30 s) or when the
conversation or its events are read.

`POST /api/chat/runs/{id}/cancel` stops a `queued`, `running` or `awaiting_confirmation` run and
returns `200 { run }`, normally with `status: "cancelled"`, `reason: "user_cancelled"`. A run that
finished on its own while the cancel was handled is returned as it finished (e.g. `completed`): use
the returned status. A run already finished before the request answers `409 run_not_active` (body
has `run`), an unknown one `404 run_not_found`. The request waits up to 10 seconds for a tool call
that is executing; that call finishes, nothing after it runs, and a write whose outcome is unknown
is reported in `changed` without scope.

## 9. Event types

All events have `seq`, `type`, `createdAt`. The fields per type (others are absent):

| `type`              | Fields                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `message_created`   | `message` (the user message)                                                                                        |
| `run_started`       | `runId`, `messageId` (the new assistant message), `run`                                                             |
| `run_resumed`       | `runId`, `messageId`, `run` (after a confirmation decision)                                                         |
| `text_delta`        | `runId`, `messageId`, `partIndex`, `text`                                                                           |
| `tool_started`      | `runId`, `messageId`, `partIndex`, `toolUseId`, `name`, `label`                                                     |
| `tool_finished`     | `runId`, `messageId`, `partIndex`, `toolUseId`, `name`, `status`, `summary`, `changed`, `changes`                   |
| `action_required`   | `runId`, `messageId`, `partIndex`, `action`                                                                         |
| `action_resolved`   | `runId`, `messageId`, `partIndex`, `actionId`, `status`                                                             |
| `message_completed` | `runId`, `messageId`, `message` (the final assistant message)                                                       |
| `run_finished`      | `runId`, `messageId` (null if the run never started), `status`, `reason`, `changed`, `changes`, `run`, `capability` |
| `error`             | `runId`, `code` (= the run's reason), `error` (English text for logs); always followed by `run_finished`            |

How to fold events into the assistant message (the server builds the stored message the same
way, so history looks exactly like the live stream):

```
on run_started:      create assistant message {id: messageId, status: in_progress, parts: []}
on text_delta:       if parts[partIndex] is a text part: append text, else parts[partIndex] = {type: text, text}
on tool_started:     parts[partIndex] = {type: tool, toolUseId, name, label, status: running}
on tool_finished:    parts[partIndex].status/summary/changed/changes = event values
on action_required:  parts[partIndex] = {type: action, actionId: action.id, …action, status: pending}
on action_resolved:  parts[partIndex].status = event.status
on message_completed: replace the message with event.message
on run_finished:     update the run, refresh `changed` data (§10), update the capability (§1)
```

`partIndex` values of one message start at 0 and grow by one per new part.

### Example: log a food and delete an entry with confirmation

```json
{"seq":1,"type":"message_created","createdAt":"2026-11-19T20:56:14.871Z","message":{"id":"d0a7f2a9-8122-420c-ad0b-e2e5c29644a7","conversationId":"83e75848-4125-4fab-b1d5-671e38b93bba","role":"user","status":"completed","reason":null,"runId":"9eab9b08-7b01-49f0-afb3-e2f749da54ae","parts":[{"type":"text","text":"Log 150 g yogurt, delete the old one"}],"createdAt":"2026-11-19T20:56:14.871Z","updatedAt":"2026-11-19T20:56:14.871Z"}}
{"seq":2,"type":"run_started","createdAt":"2026-11-19T20:56:14.906Z","runId":"9eab9b08-7b01-49f0-afb3-e2f749da54ae","messageId":"36380e54-7a5c-4e66-98ff-c9370ebecae3","run":{"id":"9eab9b08-7b01-49f0-afb3-e2f749da54ae","conversationId":"83e75848-4125-4fab-b1d5-671e38b93bba","userMessageId":"d0a7f2a9-8122-420c-ad0b-e2e5c29644a7","assistantMessageId":"36380e54-7a5c-4e66-98ff-c9370ebecae3","status":"running","reason":null,"changed":[],"changes":[],"createdAt":"2026-11-19T20:56:14.871Z","startedAt":"2026-11-19T20:56:14.893Z","finishedAt":null}}
{"seq":3,"type":"text_delta","createdAt":"2026-11-19T20:56:15.059Z","runId":"9eab9b08-7b01-49f0-afb3-e2f749da54ae","messageId":"36380e54-7a5c-4e66-98ff-c9370ebecae3","partIndex":0,"text":"Let me log that."}
{"seq":4,"type":"tool_started","createdAt":"2026-11-19T20:56:15.095Z","runId":"9eab9b08-7b01-49f0-afb3-e2f749da54ae","messageId":"36380e54-7a5c-4e66-98ff-c9370ebecae3","partIndex":1,"toolUseId":"toolu_dca7168143174af29733","name":"log_food","label":"Logging food"}
{"seq":5,"type":"tool_finished","createdAt":"2026-11-19T20:56:15.122Z","runId":"9eab9b08-7b01-49f0-afb3-e2f749da54ae","messageId":"36380e54-7a5c-4e66-98ff-c9370ebecae3","partIndex":1,"toolUseId":"toolu_dca7168143174af29733","name":"log_food","status":"ok","summary":null,"changed":["entries"],"changes":[{"domain":"entries","dates":["2026-11-18"]}]}
{"seq":6,"type":"action_required","createdAt":"2026-11-19T20:56:15.144Z","runId":"9eab9b08-7b01-49f0-afb3-e2f749da54ae","messageId":"36380e54-7a5c-4e66-98ff-c9370ebecae3","partIndex":2,"action":{"id":"435baadf-008d-4a69-a948-659b75aa3589","conversationId":"83e75848-4125-4fab-b1d5-671e38b93bba","runId":"9eab9b08-7b01-49f0-afb3-e2f749da54ae","messageId":"36380e54-7a5c-4e66-98ff-c9370ebecae3","toolUseId":"toolu_17f54b831c2240e493a1","name":"delete_entry","label":"Deleting an entry","status":"pending","preview":{"summary":"Delete “Greek yogurt” from Breakfast on 18 Nov 2026","details":["2 servings · 120 kcal"]},"expiresAt":"2026-11-19T21:56:15.139Z","decidedAt":null,"createdAt":"2026-11-19T20:56:15.124Z"}}
```

The user approves (`POST /api/chat/actions/435baadf-…` `{"decision":"approve"}`):

```json
{"seq":7,"type":"action_resolved","createdAt":"2026-11-19T20:56:15.172Z","runId":"9eab9b08-…","messageId":"36380e54-…","partIndex":2,"actionId":"435baadf-008d-4a69-a948-659b75aa3589","status":"approved"}
{"seq":8,"type":"run_resumed","createdAt":"2026-11-19T20:56:15.193Z","runId":"9eab9b08-…","messageId":"36380e54-…","run":{"…":"…","status":"running","changed":["entries"],"changes":[{"domain":"entries","dates":["2026-11-18"]}]}}
{"seq":9,"type":"tool_started","createdAt":"2026-11-19T20:56:15.220Z","runId":"9eab9b08-…","messageId":"36380e54-…","partIndex":3,"toolUseId":"toolu_17f54b831c2240e493a1","name":"delete_entry","label":"Deleting an entry"}
{"seq":10,"type":"tool_finished","createdAt":"2026-11-19T20:56:15.234Z","runId":"9eab9b08-…","messageId":"36380e54-…","partIndex":3,"toolUseId":"toolu_17f54b831c2240e493a1","name":"delete_entry","status":"ok","summary":null,"changed":["entries"],"changes":[{"domain":"entries","dates":["2026-11-18"]}]}
{"seq":11,"type":"text_delta","createdAt":"2026-11-19T20:56:15.254Z","runId":"9eab9b08-…","messageId":"36380e54-…","partIndex":4,"text":"Logged 150 g Greek yogurt and removed the old entry."}
{"seq":12,"type":"message_completed","createdAt":"2026-11-19T20:56:15.274Z","runId":"9eab9b08-…","messageId":"36380e54-…","message":{"id":"36380e54-…","role":"assistant","status":"completed","reason":null,"runId":"9eab9b08-…","parts":[{"type":"text","text":"Let me log that."},{"type":"tool","toolUseId":"toolu_dca7…","name":"log_food","label":"Logging food","status":"ok","summary":null,"changed":["entries"],"changes":[{"domain":"entries","dates":["2026-11-18"]}]},{"type":"action","actionId":"435baadf-…","toolUseId":"toolu_17f5…","name":"delete_entry","label":"Deleting an entry","status":"approved","preview":{"summary":"Delete “Greek yogurt” from Breakfast on 18 Nov 2026","details":["2 servings · 120 kcal"]},"expiresAt":"2026-11-19T21:56:15.139Z"},{"type":"tool","toolUseId":"toolu_17f5…","name":"delete_entry","label":"Deleting an entry","status":"ok","summary":null,"changed":["entries"],"changes":[{"domain":"entries","dates":["2026-11-18"]}]},{"type":"text","text":"Logged 150 g Greek yogurt and removed the old entry."}],"conversationId":"83e75848-…","createdAt":"…","updatedAt":"…"}}
{"seq":13,"type":"run_finished","createdAt":"2026-11-19T20:56:15.274Z","runId":"9eab9b08-…","messageId":"36380e54-…","status":"completed","reason":null,"changed":["entries"],"changes":[{"domain":"entries","dates":["2026-11-18"]}],"run":{"…":"…","status":"completed","finishedAt":"2026-11-19T20:56:15.274Z"},"capability":{"available":true,"remainingBudgetUsd":9.98}}
```

A failed run ends with `error` then `message_completed` then `run_finished`, e.g.
`{"type":"error","code":"user_budget_exhausted","error":"This month's assistant budget is used up.",…}`.

## 10. Keeping cached data fresh (`changed`)

Every `tool_finished` lists what that call changed, and `run_finished` (and `ChatRun`) repeats the
merged list for the whole run, so a client that only looks at the run at the end still gets it.
Both are also derivable from the stored message (the `tool` parts' `changes`).

- `changed: string[]` — the domains, the baseline. Refresh what you cache of each.
- `changes: ChatChange[]` — the same domains with their scope, one entry per domain:
  `{ domain, dates?, ids? }`. `dates` are diary days (YYYY-MM-DD) and `ids` record ids. An entry
  with **neither** means "anything in this domain may have changed": refresh it fully.

| Domain          | What to refresh                               | Scope given                                                                                                            |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `entries`       | Diary entries and day totals                  | `dates` when known (log, update, delete, copy, supplement log); none after a food merge or a forced food/recipe delete |
| `foods`         | Food list / food detail                       | `ids`; none when a supplement created foods for its ingredients                                                        |
| `recipes`       | Recipes                                       | `ids` when known; none when a deleted food was an ingredient                                                           |
| `goals`         | Goals                                         | none                                                                                                                   |
| `weight`        | Weight entries / trend                        | `dates` (log) or `ids` (update, delete)                                                                                |
| `sleep`         | Sleep entries                                 | `dates` (log) or `ids` (update, delete)                                                                                |
| `supplements`   | Supplements and the supplement checklist      | `ids` when known                                                                                                       |
| `dayProperties` | Water, activity, fasting flag, day notes      | `dates`                                                                                                                |
| `labels`        | Food/recipe labels                            | none (the affected food/recipe ids are in `foods`/`recipes`)                                                           |
| `preferences`   | Preferences (`GET /api/preferences`)          | none; also after a custom meal type is created, renamed or deleted (the meal order changes)                            |
| `fasting`       | Recorded fasts (`/api/fasts`)                 | `ids`                                                                                                                  |
| `reminders`     | Reminders (`/api/reminders`); reschedule them | `ids`; none after a meal type rename (its meal reminders were renamed with it)                                         |
| `mealTypes`     | Custom meal types (`/api/meal-types`)         | `ids`                                                                                                                  |

Unknown domain → ignore it (or refresh everything if you prefer safety). Editing a food changes
the macros shown for entries that use it; like an edit through the REST API, that is reported as
`foods` only. When a run stops while a write executes (cancel, restart), the write's outcome is
unknown: its tool part ends as `error` and its `changed`/`changes` list every domain it may have
touched, without scope, so `run_finished` always covers everything that may have been written.

## 11. Limits

| Limit                         | Value                                                       | Error                                  |
| ----------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| Message text                  | 1–4000 characters                                           | 400                                    |
| Photos per message            | 5, each ≤ 4 MB                                              | 400 `invalid_image`                    |
| Messages per user             | 60 per rolling 24 h, deleted conversations included         | 429 `daily_limit_reached`              |
| Conversation length           | 40 user messages, ~1 MB transcript, 20 photos, 12 MB photos | 409 `conversation_too_long`            |
| Context window of the model   | full                                                        | run `failed` / `conversation_too_long` |
| Active runs                   | 1 per conversation                                          | 409 `run_active`                       |
| Model calls per run           | `CLAUDE_MAX_ITERATIONS` (default 20)                        | run `completed` / `iteration_limit`    |
| Writes without confirmation   | 10 per run, then every write asks                           | confirmation card                      |
| Confirmation lifetime         | 60 minutes                                                  | `action_expired`                       |
| Events endpoint               | 240 requests/min per user (SSE connects included)           | 429 + `Retry-After`                    |
| SSE streams                   | 3 open per user (a fourth closes the oldest)                | stream ends, reconnect                 |
| SSE stream                    | ping every 20 s, closed after 10 min                        | reconnect                              |
| Concurrent runs on the server | 3, at most 2 per user (others wait in `queued`)             | —                                      |

## 12. What the assistant can and cannot reach

The assistant uses the MCP tools (see `docs/mcp-tools.json`), except the AI-task queue tools
(`list_ai_tasks`, `get_ai_task`, `complete_ai_task`, `dismiss_ai_task`: the queue has its own
processing) and the bulk label sweep (`list_unlabeled_foods`, `list_unlabeled_recipes`,
`set_food_labels_batch`, `set_recipe_labels_batch`). It also has web search and, where the model
supports it, web fetch. Through those tools it reads and writes entries, foods (including
favorites), recipes, goals, weight, sleep, supplements and their logs, day properties (water,
activity, notes, the fasting-day flag), labels, recorded fasts, reminders, custom meal types and
part of the preferences, and reads statistics, analytics, where a food or recipe is used, the
brands in the food database and the USDA nutrient database (when the server has an
`FDC_API_KEY`).

The preferences it may change: dashboard widget visibility and order, start page, favourite tap
and meal assignment behaviour, the favourite meal time windows, meal order, pinned insights,
visible nutrients, water goal, and activity goal adjustment. It reads but cannot change the app
language, time zone, biological sex, AI-task processing (and auto-log), the caloric-lag override
of the insights page and the legacy combined day-details toggle.

Not reachable (no MCP tools): a fast that is running (it lives in the device's fasting timer
until the user ends it; the server only stores finished fasts), the AI-task queue, push
notifications, account settings and sign-in methods, imports and exports. Those domains never
appear in `changed`.

## 13. Privacy

Everything the user writes or attaches in a chat, the conversation so far, and whatever diary data
the assistant looks up to answer (potentially any of the user's data) is sent to Anthropic to be
processed by Claude. Conversations stay until the user deletes them (or the account), and are part
of the account export (`chatConversations`, `chatMessages` in `bissbilanz.json`). The privacy
policy says this; link to it from the chat's first-use screen.
