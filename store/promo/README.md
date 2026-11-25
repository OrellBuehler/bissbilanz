# Store promo images

Framed promo images for both stores, built from raw screenshots.

```bash
bun run store:screenshots                                   # everything, en + de
bun run store:screenshots --target ios-6.9 --only insights --locale de
```

| Target         | Size        | Used for                              |
| -------------- | ----------- | ------------------------------------- |
| `ios-6.9`      | 1320 × 2868 | App Store 6.9" slot (`APP_IPHONE_67`) |
| `ios-6.5`      | 1284 × 2778 | App Store 6.5" slot (`APP_IPHONE_65`) |
| `play-phone`   | 1080 × 1920 | Play phone screenshots                |
| `play-feature` | 1024 × 500  | Play feature graphic                  |

- `screens-ios/<locale>/` — raw iPhone simulator screenshots with invented demo data, one set per locale. Refresh them by running the **Store Screenshots (iOS)** workflow and downloading its `ios-store-screenshots` artifact into this folder
- `screens-android/<locale>/` — raw Android emulator screenshots with invented demo data, one set per locale (`dashboard`, `dashboard-dark`, `foods`, `insights-dark`, `log-food`, `nutrients`, `recipe`, `weight`). Refresh them by running the **Store Screenshots (Android)** workflow and downloading its `android-store-screenshots` artifact into this folder
- `config.ts` — targets and slides: screenshot, headline (`*word*` = accent colour), subline, theme, badges, zoomed crop, clean status bar
- `template.ts` — HTML/CSS layout, the CSS device frames and the feature graphic
- `out/<target>/<locale>/` — PNGs to upload (gitignored); `html/` holds the rendered pages for tweaking in a browser

Needs Playwright's Chromium: `bunx playwright install chromium`.

## Refreshing the raw screenshots

Both stores' raws come from CI, never from a real diary: the Debug apps run on an in-memory or throwaway store filled with the same invented foods, days, recipe and weight series (`StoreScreenshotSeed.swift` on iOS, `StoreScreenshotSeed.kt` on Android).

```bash
gh workflow run "Store Screenshots (iOS)"       # artifact: ios-store-screenshots
gh workflow run "Store Screenshots (Android)"   # artifact: android-store-screenshots
gh run download <run id> -n android-store-screenshots -D store/promo/screens-android
gh run download <run id> -n ios-store-screenshots -D store/promo/screens-ios
bun run store:screenshots
```

The artifacts hold `<locale>/<name>.png`, so they unpack straight into `screens-ios/` and `screens-android/`. Both workflows also run on pull requests that touch their script, seed or workflow.

The Android capture (`scripts/android/store-screenshots.sh`) needs an emulator, so it only runs in CI. It sets the emulator display to 1080 × 1920 at 420 dpi, turns on system UI demo mode (9:41, full battery, no notifications), and launches the Debug app once per screen with `--es store_screenshot <screen>` (`home`, `log-food`, `foods`, `insights`, `weight`, `recipe`, `nutrients`, ...). The app then runs in Local mode on the demo data and opens that screen. A capture is only taken once the accessibility tree shows the screen's own text and no progress indicator; blank or half-loaded captures are retried. The seed lives in a Debug build only (`BuildConfig.DEBUG`), so nothing of it ships.
