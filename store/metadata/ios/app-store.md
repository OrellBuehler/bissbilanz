# App Store metadata (en-US primary, de-DE localization)

App Store Connect listing copy for the first public release (previously used for the TestFlight beta information sheet).

## Name

Bissbilanz — Calorie Tracker (de: Bissbilanz — Kalorienzähler)

## Subtitle (30 chars max)

- en: `Calories, macros & barcodes`
- de: `Kalorien, Makros & Barcodes`

## Promotional text (170 chars, editable without review)

- en: `Fast calorie and macro tracking: scan barcodes, read nutrition labels with the camera, log in one tap — offline-ready, no ads, no data selling.`
- de: `Schnelles Kalorien- und Makro-Tracking: Barcodes scannen, Nährwerttabellen mit der Kamera erfassen, mit einem Tipp loggen — offlinefähig, ohne Werbung.`

## Description

Base copy is `store/metadata/android/<locale>/full_description.txt`, but two spots there are Android-specific and need editing before pasting into App Store Connect — the shared file is Play-accurate, not verbatim-portable:

1. In the "LOG FAST" / "SCHNELL EINTRAGEN" section, replace the widgets bullet — drop the Wear OS mention (Wear OS doesn't exist on iOS; Apple Watch is covered in the iOS-only paragraph below):
   - en: `• Home-screen widgets for logging with one tap`
   - de: `• Homescreen-Widgets zum Eintragen mit einem Tipp`
2. Remove the "HEALTH CONNECT" / same-named section entirely (Android-only API) — Apple Health is covered in the iOS-only paragraph below instead.

Then add this iOS-only paragraph before the closing "ONLY FOR YOU" / "NUR FÜR DICH" section:

- en:

  ```
  MADE FOR iPHONE
  • Home-screen and lock-screen widgets for one-tap logging
  • Apple Watch app for logging on the go
  • Apple Health: import weight and sleep, write back weight, sleep and nutrition
  • Fasting timer with Live Activity
  • Ask Siri to log food or check today's stats
  ```

- de:

  ```
  FÜR DAS iPHONE GEMACHT
  • Homescreen- und Sperrbildschirm-Widgets zum Loggen mit einem Tipp
  • Apple-Watch-App für unterwegs
  • Apple Health: Gewicht und Schlaf importieren, Gewicht, Schlaf und Nährwerte zurückschreiben
  • Fasten-Timer mit Live Activity
  • Mit Siri Essen loggen oder den Tagesstand abfragen
  ```

## Keywords (100 chars)

- en: `calorie,counter,macro,tracker,food,diary,barcode,scanner,protein,diet,nutrition,fasting`
- de: `kalorien,zähler,makro,tracker,ernährung,tagebuch,barcode,scanner,protein,diät,fasten`

## URLs

- Support URL: https://bissbilanz.orellbuehler.ch/support
- Marketing URL: https://bissbilanz.orellbuehler.ch
- Privacy Policy URL: https://bissbilanz.orellbuehler.ch/privacy

## Age rating

All questionnaire answers "No" → 4+.

## App Privacy labels (fill in App Store Connect)

Data used to track you: **none**.
Data linked to you:

| Data type                                  | Purpose           | Notes                                                                                                                                                                                                                 |
| ------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                                       | App Functionality | From the sign-in provider                                                                                                                                                                                             |
| Email address                              | App Functionality | From the sign-in provider; a relay address when Hide My Email is used                                                                                                                                                 |
| User ID                                    | App Functionality | The account identifier each linked provider uses for the user                                                                                                                                                         |
| Health & Fitness                           | App Functionality | Food, weight, sleep logs; optional Apple Health (weight/sleep import; write of weight, sleep and, per nutrient the user opts into, nutrition)                                                                         |
| Photos (user photos)                       | App Functionality | Food/recipe photos, AI meal estimation                                                                                                                                                                                |
| User content                               | App Functionality | Foods, recipes, notes                                                                                                                                                                                                 |
| Diagnostics (Crash Data, Performance Data) | App Functionality | Sentry. Linked via a persistent internal account identifier (not name or email); crash events also attach an on-device screenshot and view hierarchy of the screen in use, which can show food-log or account content |

Sign-in providers: Infomaniak, Google and Sign in with Apple. Only the one the user picks is
involved; where the provider supplies a profile picture (Infomaniak, Google), its URL is stored with
the account.

Data not linked to you: none.

Local-only mode sends nothing to the Bissbilanz server: data stays on device, mirrored to the user's private iCloud database. Crash reports still go to Sentry (unlinked — no user ID is set without an account) and barcode/food searches go directly to Open Food Facts.

## Export compliance

Already handled: `ITSAppUsesNonExemptEncryption: false` in `mobile/iosApp/project.yml` (HTTPS only — exempt).
