# Custom Supplement Tracking — Design

**Date:** 2026-02-17
**Status:** Approved

## Context

Users want to track daily supplement intake alongside their food logging. Supplements have schedules (daily, every other day, weekly, specific weekdays) and the user checks them off via a dashboard checklist. History shows adherence over time.

This is a **standalone system**, separate from the food/entry tables.

## Database Schema

### `supplements`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Auto-generated |
| `user_id` | uuid FK → users (cascade) | Owner |
| `name` | text NOT NULL | e.g., "Vitamin D3" |
| `dosage` | real NOT NULL | e.g., 1000 |
| `dosage_unit` | text NOT NULL | e.g., "mg", "mcg", "IU", "capsules" |
| `schedule_type` | enum NOT NULL | `daily`, `every_other_day`, `weekly`, `specific_days` |
| `schedule_days` | integer[] | Day-of-week numbers (0=Sun..6=Sat). Used by `weekly` and `specific_days`. NULL for `daily`/`every_other_day`. |
| `schedule_start_date` | date | Reference date for `every_other_day` calculation. Defaults to creation date. |
| `is_active` | boolean NOT NULL DEFAULT true | Soft-disable without deleting |
| `sort_order` | integer NOT NULL | User-defined ordering |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Indexes: `user_id`, `(user_id, is_active)`

### `supplement_logs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Auto-generated |
| `supplement_id` | uuid FK → supplements (cascade) | Which supplement |
| `user_id` | uuid FK → users (cascade) | Denormalized for efficient date-range queries |
| `date` | date NOT NULL | Which day |
| `taken_at` | timestamptz NOT NULL | When checked off |
| `created_at` | timestamptz | |

Unique constraint: `(supplement_id, date)` — one log per supplement per day.
Indexes: `(user_id, date)`, `supplement_id`

### Schedule Logic (app-side)

- **daily** — always due
- **every_other_day** — due if `(today - schedule_start_date) % 2 === 0`
- **weekly** — due if `today.dayOfWeek` is in `schedule_days`
- **specific_days** — due if `today.dayOfWeek` is in `schedule_days`

## API Endpoints

### Supplement CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/supplements` | List user's supplements (active by default, `?all=true` for all) |
| POST | `/api/supplements` | Create supplement |
| PUT | `/api/supplements/[id]` | Update supplement |
| DELETE | `/api/supplements/[id]` | Delete supplement (cascades logs) |

### Supplement Logs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/supplements/today` | Today's checklist: due supplements + taken status |
| POST | `/api/supplements/[id]/log` | Mark taken (body: `{ date? }`, defaults today) |
| DELETE | `/api/supplements/[id]/log/[date]` | Uncheck — remove log entry |
| GET | `/api/supplements/history?from=&to=` | Log history with date range |

All endpoints require auth. Users can only access their own data.
Input validation via Zod schemas.

## UI

### Dashboard Card (`/app`)

- "Supplements" card below meal sections
- Checklist of today's due supplements
- Each row: checkbox + name + dosage (e.g., "Vitamin D3 — 1000 IU")
- Tap checkbox to toggle taken/not taken
- Link to supplements management page

### Management Page (`/app/supplements`)

- List all supplements (active and inactive)
- Each row: name, dosage, schedule summary (e.g., "Daily", "Mon/Wed/Fri")
- Toggle active/inactive
- Reorder via sort order
- "Add supplement" button → creation form

### Add/Edit Form (modal)

- **Name** — text input
- **Dosage** — number input
- **Unit** — select: mg, mcg, IU, g, capsules, tablets, drops, ml
- **Schedule type** — radio/select
- **Days** — weekday picker (conditional, for weekly/specific_days)
- **Start date** — date picker (conditional, for every_other_day)

### History Page (`/app/supplements/history`)

- Table/list view: date rows × supplement columns
- Checkmarks for taken days
- Date range filter

### Navigation

- Add "Supplements" to sidebar with `Pill` icon (lucide-svelte)

## MCP Tools

| Tool | Description |
|------|-------------|
| `get-supplement-status` | Returns today's supplement checklist with taken/pending status |
| `log-supplement` | Mark a supplement as taken by name or ID |

## Dosage Units

Predefined list: `mg`, `mcg`, `IU`, `g`, `capsules`, `tablets`, `drops`, `ml`

## Out of Scope

- Push notification reminders
- Supplement stacks/groups
- Interaction warnings
- Supplement database/autocomplete search
