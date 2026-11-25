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
| `og`           | 1200 × 630  | Link preview, `static/og-image.png`   |
| `web-hero`     | 652 × 1358  | Landing page phones, `static/landing` |

The first three slides of each phone target are rendered as one panorama and cut into thirds, because the stores show them side by side in search results; `panorama.png` in the output folder is the uncut canvas. `og` and `web-hero` write into `static/` and are committed.

- `screens-ios/<locale>/` — raw iPhone simulator screenshots with invented demo data, one set per locale. Refresh them by running the **Store Screenshots (iOS)** workflow and downloading its `ios-store-screenshots` artifact into this folder
- `screens-android/<locale>/` — raw Android emulator screenshots, one set per locale
- `config.ts` — targets and slides: screenshot, headline (`*word*` = accent colour), subline, theme, badges, zoomed crop, clean status bar
- `template.ts` — HTML/CSS layout, the CSS device frames, the panorama and the wide banner used for the feature graphic and link preview
- `out/<target>/<locale>/` — PNGs to upload (gitignored); `html/` holds the rendered pages for tweaking in a browser

Needs Playwright's Chromium: `bunx playwright install chromium`.
