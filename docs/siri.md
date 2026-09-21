# Siri, Shortcuts and Spotlight (iOS)

The iOS app exposes its diary to the system through App Intents, so a question can be
answered without opening the app. Everything below is read from the local SwiftData
store, which means it also works offline and in Local mode.

## App Shortcuts

Six shortcuts are registered at install (`Intents/BissbilanzShortcuts.swift`) — they
appear in the Shortcuts app, in Spotlight and to Siri without any donation. Phrases are
English only.

| Shortcut       | Intent                 | Example phrase                               |
| -------------- | ---------------------- | -------------------------------------------- |
| Log Food       | `LogFoodIntent`        | "Log {food} with Bissbilanz"                 |
| Log Recipe     | `LogRecipeIntent`      | "Log {recipe} with Bissbilanz"               |
| Daily Status   | `GetDailyStatusIntent` | "How many calories did I have in Bissbilanz" |
| Weekly Summary | `GetWeeklyStatsIntent` | "How was my week in Bissbilanz"              |
| Weight         | `GetWeightIntent`      | "What's my weight in Bissbilanz"             |
| Sleep          | `GetSleepIntent`       | "How did I sleep in Bissbilanz"              |

The four read-only shortcuts take no phrase parameter on purpose: their day parameter is
optional (it defaults to today), and a phrase token has to name a parameter the system
can always resolve.

## Spotlight index

Three entity types are pushed into the Spotlight index as `IndexedEntity` values, each
with a natural-sentence `contentDescription` — that text is what a spoken question is
matched against, so it spells the numbers out instead of abbreviating them.

| Entity             | Identifier      | Source                         |
| ------------------ | --------------- | ------------------------------ |
| `DaySummaryEntity` | ISO date        | entries + goals + fasting flag |
| `WeightEntity`     | weight entry id | weight log                     |
| `SleepEntity`      | sleep entry id  | sleep log                      |

Days with nothing logged are not indexed, and an entry that disappears is deleted from
the index rather than left to answer with stale data.

The index is kept in step from two sides:

- **Incrementally**, after every write — `IntentDonations.dayChanged` /
  `weightChanged` / `sleepChanged` report the touched ids, and `NutritionReader` /
  `BodyReader` rebuild exactly those records.
- **By backfill**, at launch — the last 90 days of day summaries, weight entries and
  logged nights, which covers everything that arrived from the server or another device.

On iOS 27 the three queries also conform to `IndexedEntityQuery`, so the system can ask
the app to rebuild part or all of the index when it finds a problem with it.

## On-screen awareness

The dashboard's day, the day log, and the weight and sleep rows carry the identifier of
the entity they display (`siriEntity(_:id:)` in `Intents/SiriIOS27.swift`), so Siri can
resolve "this day" or "that entry" against what is on screen. It is a no-op below
iOS 18.4.
