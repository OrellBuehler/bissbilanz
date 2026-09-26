# App Store screenshots

Framed promo images (1284 × 2778, the App Store 6.5" slot) built from raw iPhone screenshots.

```bash
bun run store:screenshots                         # all slides, en + de
bun run store:screenshots --only insights --locale de
```

- `screens/` — raw screenshots (any iPhone resolution)
- `config.ts` — slides: screenshot, headline (`*word*` = accent colour), subline, theme, badges, zoomed crop, clean status bar
- `template.ts` — HTML/CSS layout and the CSS iPhone frame
- `out/<size>/<locale>/` — PNGs to upload (gitignored); `html/` holds the rendered pages for tweaking in a browser

Needs Playwright's Chromium: `bunx playwright install chromium`.
