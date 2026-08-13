# Reviewer access notes (Play "App access" + App Store "App Review Information")

Paste-ready notes for both consoles.

## Notes for the reviewer

```
Bissbilanz is a personal calorie/macro tracker.

SIGN-IN: The app offers two modes on first launch:
1. "Local mode" — works WITHOUT any account. All features except
   cross-device sync are available. You can review the entire app this way.
2. Sign-in via Infomaniak (OIDC), used for sync with the web app.
   Demo account credentials are provided below.

CAMERA: used only for barcode scanning and on-device nutrition-label OCR
(Settings → add food → scan). Frames are processed on device; only the
barcode number is sent to the Open Food Facts API.

ACCOUNT DELETION: Settings → Delete account (also documented at
https://bissbilanz.orellbuehler.ch/account-deletion).

PRIVACY POLICY: https://bissbilanz.orellbuehler.ch/privacy
```

## Demo account

> **TODO (manual):** create a dedicated demo user in Infomaniak and fill in:
>
> - Email: `store-review@…`
> - Password: (store in 1Password, paste into both consoles)
>
> Seed it with a few days of entries so the dashboard isn't empty.
> Do not reuse a personal account.

## iOS-specific

- The watch app and widgets need the same account; mention they mirror the
  phone's data.
- Apple Health prompts appear only when toggled in Settings → Apple Health.
- Sign in with Apple is **not** required: Infomaniak OIDC is the app's own
  first-party account system for a free app with no third-party social logins
  (guideline 4.8 exemption: it is a "company's own account system").
  If review pushes back, cite the local-only mode as the no-account path.
