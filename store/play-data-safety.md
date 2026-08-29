# Play Console answer sheet

Answers for the Console-only forms, kept in-repo so they stay consistent with the
privacy policy (`/privacy`). Update this file and the policy together.

## Data Safety form

**Does your app collect or share any of the required user data types?** Yes (when signed in; local-only mode collects nothing).

**Is all of the user data collected by your app encrypted in transit?** Yes.

**Do you provide a way for users to request that their data is deleted?** Yes —
in-app (Settings → Delete account) and https://bissbilanz.orellbuehler.ch/account-deletion

| Data type                                   | Collected | Shared | Optional         | Purpose                                                   |
| ------------------------------------------- | --------- | ------ | ---------------- | --------------------------------------------------------- |
| Personal info → Name                        | Yes       | No     | Yes (local mode) | Account management                                        |
| Personal info → Email address               | Yes       | No     | Yes (local mode) | Account management                                        |
| Personal info → User IDs                    | Yes       | No     | Yes (local mode) | Account management (identifier from the sign-in provider) |
| Health & fitness → Health info              | Yes       | No     | Yes (local mode) | App functionality (food/weight/sleep logs)                |
| Photos & videos → Photos                    | Yes       | No     | Yes              | App functionality (food/recipe photos, AI estimation)     |
| App activity → Other user-generated content | Yes       | No     | Yes (local mode) | App functionality (foods, recipes, notes)                 |
| App info & performance → Crash logs         | Yes       | No     | No               | Analytics (Sentry crash reporting)                        |
| App info & performance → Diagnostics        | Yes       | No     | No               | Analytics (Sentry)                                        |

Everything else (location, contacts, device or advertising identifiers, financial info, browsing, …):
**not collected**.

Notes:

- "Shared" is No everywhere — Sentry and Open Food Facts act as service
  providers / receive no personal data; nothing is sold or shared for
  advertising.
- Umami analytics runs only on the web app, not in the Android app — it does
  not belong on this form.
- Sign-in providers: Infomaniak, Google, Microsoft and Apple. Only the provider
  the user picks is involved, and none of them receives app data — so they are
  not "sharing" either.
- Health Connect: values the user imports become normal entries and are covered
  by the Health & fitness row; nothing read from Health Connect is shared or
  sent to Sentry.
- Data deletion: account deletion removes all server data immediately.

## Content rating questionnaire (IARC)

Category: Utility / Productivity. All content questions **No** (no violence,
sexuality, language, controlled substances, gambling). Interactivity: no user
interaction features (no chat, no UGC visible to others), does not share
location. Expected rating: Everyone / PEGI 3.

Note: the app is a self-improvement/food-diary tool; if the questionnaire asks
whether the app provides medical or health advice — answer No (it records
user-entered data, gives no advice).

## App content declarations

- **Privacy policy URL:** https://bissbilanz.orellbuehler.ch/privacy
- **App access:** credentials required for sync mode. Provide the demo account
  from `store/review-notes.md`, and point out local-only mode works without
  sign-in.
- **Ads:** No ads.
- **Data safety:** see above.
- **Health apps declaration:** applies — the Android app integrates Health
  Connect (read and write weight and sleep, write nutrition). The declaration
  was submitted and approved on 2026-08-29. The app still makes no health
  claims. If the permissions change, the declaration has to be refiled.
- **Target audience:** 18+ (or 13+; do NOT include under-13 — avoids Families
  policy requirements).
- **News app:** No. **COVID-19 app:** No. **Government app:** No.
