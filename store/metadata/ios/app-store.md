# App Store metadata (en-US primary, de-DE localization)

Used for TestFlight beta information now; becomes the App Store listing on full release.

## Name

Bissbilanz — Calorie Tracker (de: Bissbilanz — Kalorienzähler)

## Subtitle (30 chars max)

- en: `Calories, macros & barcodes`
- de: `Kalorien, Makros & Barcodes`

## Promotional text (170 chars, editable without review)

- en: `Fast calorie and macro tracking: scan barcodes, read nutrition labels with the camera, log in one tap — offline-ready, no ads, no data selling.`
- de: `Schnelles Kalorien- und Makro-Tracking: Barcodes scannen, Nährwerttabellen mit der Kamera erfassen, mit einem Tipp loggen — offlinefähig, ohne Werbung.`

## Description

Reuse `store/metadata/android/<locale>/full_description.txt` — same copy works for both stores. Add this iOS-only paragraph before "YOUR DATA, YOUR PACE":

- en:

  ```
  MADE FOR iPHONE
  • Home-screen and lock-screen widgets for one-tap logging
  • Apple Watch app for logging on the go
  • Apple Health: import weight and sleep, write back weight, sleep and nutrition
  • Fasting timer with Live Activity
  ```

- de:

  ```
  FÜR DAS iPHONE GEMACHT
  • Homescreen- und Sperrbildschirm-Widgets zum Loggen mit einem Tipp
  • Apple-Watch-App für unterwegs
  • Apple Health: Gewicht und Schlaf importieren, Gewicht, Schlaf und Nährwerte zurückschreiben
  • Fasten-Timer mit Live Activity
  ```

## Keywords (100 chars)

- en: `calorie,counter,macro,tracker,food,diary,barcode,scanner,protein,diet,nutrition,fasting`
- de: `kalorien,zähler,makro,tracker,ernährung,tagebuch,barcode,scanner,protein,diät,fasten`

## URLs

- Support URL: https://bissbilanz.orellbuehler.ch/account-deletion (until a dedicated support page exists)
- Marketing URL: https://bissbilanz.orellbuehler.ch
- Privacy Policy URL: https://bissbilanz.orellbuehler.ch/privacy

## Age rating

All questionnaire answers "No" → 4+.

## App Privacy labels (fill in App Store Connect)

Data used to track you: **none**.
Data linked to you:

| Data type            | Purpose           | Notes                                           |
| -------------------- | ----------------- | ----------------------------------------------- |
| Name                 | App Functionality | From Infomaniak OIDC                            |
| Email address        | App Functionality | From Infomaniak OIDC                            |
| Health & Fitness     | App Functionality | Food, weight, sleep logs; optional Apple Health |
| Photos (user photos) | App Functionality | Food/recipe photos, AI meal estimation          |
| User content         | App Functionality | Foods, recipes, notes                           |

Data not linked to you:

| Data type   | Purpose           | Notes  |
| ----------- | ----------------- | ------ |
| Crash data  | App Functionality | Sentry |
| Performance | App Functionality | Sentry |

Local-only mode stores everything on device and sends nothing.

## Export compliance

Already handled: `ITSAppUsesNonExemptEncryption: false` in `mobile/iosApp/project.yml` (HTTPS only — exempt).
