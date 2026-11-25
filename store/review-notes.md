# Reviewer access notes (Play "App access" + App Store "App Review Information")

Paste-ready notes for both consoles.

## Notes for the reviewer

```
Bissbilanz is a personal calorie/macro tracker.

SIGN-IN: The app offers two modes on first launch:
1. "Local mode" — works WITHOUT any account. All features except
   cross-device sync are available. You can review the entire app this way.
2. Sign in with an account, used for sync with the web app. Infomaniak,
   Google and Sign in with Apple are offered; on iOS, Sign in with Apple
   runs natively. Demo account credentials are provided below.

CAMERA: used only for barcode scanning and on-device nutrition-label OCR,
reached from the dashboard's "+" button → Scan. Frames are processed on
device; only the barcode number is sent to the server (and on to Open Food
Facts) to look up the product.

AI FEATURES: Local mode uses no cloud AI. Signed-in users can queue a meal
(text or photos) for an AI assistant, and accounts the operator has enabled
also get an in-app assistant chat. For those accounts the queued meals, the
chat messages and photos, and the diary data the assistant looks up are
processed on the Bissbilanz server and sent to Anthropic (Claude API) as a
service provider, only to produce the answer; they are not used for training
or shared further. The assistant logs and summarises the user's own entries
and gives no medical advice.

ACCOUNT DELETION: Settings → Delete account (also documented at
https://bissbilanz.orellbuehler.ch/account-deletion).

PRIVACY POLICY: https://bissbilanz.orellbuehler.ch/privacy
```

## App Store notes (paste-ready)

The App Review notes field holds this text; the API tools cannot write it, so
paste it in App Store Connect → the version → App Review Information.

```
Bissbilanz is a personal calorie/macro tracker.

SIGN-IN: The app offers two modes on first launch:
1. "Local mode" — works WITHOUT any account. All features except
   cross-device sync are available. You can review the entire app this way.
2. Sign in with an account, used for sync with the web app. Infomaniak,
   Google and Sign in with Apple are offered; Sign in with Apple runs
   natively. Demo account credentials (Infomaniak) are provided above.

CAMERA / PHOTOS: used for barcode scanning, nutrition-label scanning and
photo meal estimates, reached from the dashboard's "+" button. Labels and
meal photos are analysed on device (Vision / Apple Intelligence). For
barcodes, only the barcode number is sent to look up the product on Open
Food Facts.

AI FEATURES: Local mode uses no cloud AI. Signed-in users can queue a meal
(text or photos) for an AI assistant, and accounts the operator has enabled
also get an in-app assistant chat. For those accounts the queued meals, the
chat messages and photos, and the diary data the assistant looks up are
processed on the Bissbilanz server and sent to Anthropic (Claude API) as a
service provider, only to produce the answer; they are not used for training
or shared further. The assistant logs and summarises the user's own entries
and gives no medical advice.

APPLE HEALTH: permission prompts appear only after enabling it in
Settings → Apple Health.

NOTIFICATIONS: requested only when the user enables a reminder
(Settings → Reminders) or the fasting timer.

APPLE WATCH / WIDGETS: mirror the iPhone app's data; no separate sign-in.

ACCOUNT DELETION: Settings → Delete account (also documented at
https://bissbilanz.orellbuehler.ch/account-deletion).

PRIVACY POLICY: https://bissbilanz.orellbuehler.ch/privacy
```

## Demo account

A dedicated Infomaniak store-review account exists, seeded with entries so the
dashboard isn't empty. Any of the offered providers works for review; this one
is Infomaniak.

Its credentials live in 1Password and are pasted into both consoles — they are
deliberately not in this repo, which is public. Keep the two consoles in sync
if the password is ever rotated.

## iOS-specific

- The watch app and widgets need the same account; mention they mirror the
  phone's data.
- Apple Health prompts appear only when toggled in Settings → Apple Health.
- Sign in with Apple **is** offered, natively on the sign-in screen. Since the
  app also offers Google sign-in, guideline 4.8 applies and Sign in with Apple
  is the equivalent option it asks for: it collects only name and email,
  supports Hide My Email, and is not used for advertising. Local-only mode is a
  further no-account path if review asks.
