# Importing data

Settings → **Import data** accepts three kinds of file. Every import runs in two steps:
the file is first analysed and you get a preview (row count, sample rows, anything that
could not be read), and only the **Import now** button writes to your account.

Imports are idempotent: a row whose day (weight, sleep, fasting day) or record id
(foods, recipes, supplements, food entries) already exists is skipped rather than
duplicated, so re-importing the same file changes nothing. Each import is applied in a
single transaction — it either lands completely or not at all. Files are limited to
20 MB.

## 1. A Bissbilanz export

Drop in the `.zip` produced by Settings → Export data, or the `bissbilanz.json` from
inside it. Restored: foods, recipes and their ingredients, supplements and their
ingredients, food entries, weight, sleep and fasting days.

Deliberately not restored: your profile and linked sign-in providers, app preferences
and goals, AI tasks, and uploaded images (imported foods and recipes come back without
their photo). Rows that reference a food, recipe or supplement that is neither in the
file nor already in your account are reported in the preview and skipped.

## 2. Weight CSV

| Column  | Required | Notes                                 |
| ------- | -------- | ------------------------------------- |
| `date`  | yes      | `2026-01-31` or `31.01.2026`          |
| `kg`    | yes      | also `weight`, `weight_kg`, `gewicht` |
| `notes` | no       |                                       |

```csv
date,weight_kg,notes
2026-01-01,80.5,morning
2026-01-02,80.1,
```

## 3. Sleep CSV

| Column             | Required  | Notes                                                     |
| ------------------ | --------- | --------------------------------------------------------- |
| `date`             | yes       | the evening you went to bed                               |
| `duration`         | see below | `7:30` or `7.5` (hours)                                   |
| `duration_minutes` | see below | whole minutes, e.g. `450`                                 |
| `bedtime`          | see below | `23:00` local time, or a full ISO-8601 timestamp          |
| `wake_time`        | see below | as above; a time at or before bedtime is the next morning |
| `quality`          | no        | 1–10, defaults to 7                                       |
| `notes`            | no        |                                                           |

Give either a duration column or both `bedtime` and `wake_time` — with both times and no
duration, the duration is computed from them. Wall-clock times are interpreted in the
timezone stored in your preferences.

```csv
date,bedtime,wake_time,quality,notes
2026-01-01,23:00,06:30,8,slept well
2026-01-02,,,7,
```

## Format details

Comma, semicolon and tab separated files are all accepted, as are quoted fields, a UTF-8
BOM, and `1.234,5`-style decimal commas. Column names are matched case-insensitively and
ignore spaces, underscores and accents; the common German names (`datum`, `gewicht`,
`dauer`, `qualität`, `notiz`) work too. Rows that cannot be read are listed in the
preview with their line number and skipped — the rest of the file still imports.
