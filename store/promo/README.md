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
| `ios-6.3`      | 1206 × 2622 | App Store 6.3" slot (`APP_IPHONE_61`) |
| `play-phone`   | 1080 × 1920 | Play phone screenshots                |
| `play-feature` | 1024 × 500  | Play feature graphic                  |
| `ios-header`   | 3840 × 1646 | App Store product page header         |
| `ios-search`   | 3840 × 2560 | App Store search results asset        |
| `og`           | 1200 × 630  | Link preview, `static/og-image.png`   |
| `web-hero`     | 652 × 1358  | Landing page phones, `static/landing` |

The first three slides of each phone target are rendered as one panorama and cut into thirds, because the stores show them side by side in search results; `panorama.png` in the output folder is the uncut canvas. `og` and `web-hero` write into `static/` and are committed.

- `screens-ios/<locale>/` — raw iPhone simulator screenshots with invented demo data, one set per locale. Refresh them by running the **Store Screenshots (iOS)** workflow and downloading its `ios-store-screenshots` artifact into this folder
- `screens-android/<locale>/` — raw Android emulator screenshots with invented demo data, one set per locale (`dashboard`, `dashboard-dark`, `foods`, `insights-dark`, `log-food`, `nutrients`, `recipe`, `weight`). Refresh them by running the **Store Screenshots (Android)** workflow and downloading its `android-store-screenshots` artifact into this folder
- `screens-watch/<locale>/` — raw Apple Watch simulator screenshots with invented demo data (`today`, `log`, `weight`, `sleep`), at the simulator's native pixel size. They are the `watch/` folder of the same `ios-store-screenshots` artifact, so unpack it with `gh run download <run id> -n ios-store-screenshots -D <tmp>` and copy `<tmp>/watch/*` into this folder. They go to App Store Connect as they are (the Apple Watch slot accepts any one supported size), not through `bun run store:screenshots`
- `config.ts` — targets and slides: screenshot, headline (`*word*` = accent colour), subline, theme, badges, zoomed crop, clean status bar
- `template.ts` — HTML/CSS layout, the CSS device frames, the panorama and the wide banner used for the feature graphic and link preview
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

The watch capture (`scripts/ios/store-screenshots-watch.sh`) builds the watch app for the largest Apple Watch simulator on the runner, installs it, and launches it once per screen with `-store_screenshots YES -app_locale <locale> -store_screenshot_screen <insights|meals|log|weight|sleep>`. A lone watch simulator has no phone to sync from, so `WatchScreenshotSeed.swift` (Debug builds only) hands the app invented state matching the phone seed. Each capture logs its pixel size, and a blank one is retried.

The Android capture (`scripts/android/store-screenshots.sh`) needs an emulator, so it only runs in CI. It sets the emulator display to 1080 × 1920 at 420 dpi, turns on system UI demo mode (9:41, full battery, no notifications), and launches the Debug app once per screen with `--es store_screenshot <screen>` (`home`, `log-food`, `foods`, `insights`, `weight`, `recipe`, `nutrients`, ...). The app then runs in Local mode on the demo data and opens that screen. A capture is only taken once the accessibility tree shows the screen's own text and no progress indicator; blank or half-loaded captures are retried. The seed lives in a Debug build only (`BuildConfig.DEBUG`), so nothing of it ships.

The App Store header and search results assets are cropped differently per device, so their key content sits in Apple's safe area (header: 1646 × 661 at 1097, 493; search: 2168 × 1030 at 836, 765). Upload them by hand under the version's **Header and Search Results** tab, once per language.
