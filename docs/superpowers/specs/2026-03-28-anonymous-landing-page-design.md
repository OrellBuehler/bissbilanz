# Anonymous Landing Page

## Goal

Replace the bare login redirect with an attractive landing page for anonymous visitors. The page should communicate what Bissbilanz does, feel premium and honest, and funnel users directly into the OIDC login flow.

## Decisions

- **Tone**: Premium feel with real feature descriptions. No fake stats, no inflated social proof, no pricing.
- **Sections**: Hero → Features grid → CTA → Minimal footer (no mobile mockup, no stats bar).
- **CTA action**: "Get Started" triggers Infomaniak OIDC login directly (no intermediate login page).
- **Icons**: Lucide only (`@lucide/svelte`). No emoji.
- **Font**: Manrope (via `@fontsource-variable/manrope`) for landing page headings. Rest uses existing app fonts.
- **i18n**: All visible text via Paraglide (en + de).
- **Dark mode**: Supported via existing OKLCH token system.

## Architecture

### Routing

- New file: `src/routes/+page.svelte` — the landing page component (outside `(app)` group)
- New file: `src/routes/+page.server.ts` — server load function that redirects authenticated users to the `/(app)` dashboard

### Auth changes

- `src/hooks.server.ts`: Add `/` to the public paths list so unauthenticated users can access the root route without being redirected to `/login`.

### Font loading

- Install `@fontsource-variable/manrope` via bun.
- Import in `+page.svelte` (scoped to landing page only, not loaded app-wide).

## Sections

### 1. Hero

- Small pill badge: "Track what matters" (or equivalent i18n key)
- Headline using Manrope: "Know every bite. Own every goal." — second line in primary/accent color
- Subheading: honest one-liner about what the app does (calories, macros, 43+ nutrients, recipes, barcode scanning, AI logging, offline PWA)
- Two buttons:
  - **Primary**: "Get Started — it's free" → triggers `/api/auth/login` redirect
  - **Secondary/outline**: "See Features" → smooth-scrolls to features section

### 2. Features Grid

Six feature cards in a responsive grid (2 columns on desktop, 1 on mobile). Each card has:

- Lucide icon
- Title
- Short description (1-2 sentences)

Cards:

| Feature                   | Icon          | Description                                                                                         |
| ------------------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| Macro & Nutrient Tracking | `ChartColumn` | Calories, protein, carbs, fat, fiber — plus 43 extended nutrients from vitamins to minerals.        |
| Barcode Scanner           | `ScanBarcode` | Scan any product to instantly pull nutrition data from Open Food Facts.                             |
| AI-Assisted Logging       | `Bot`         | Describe your meal in natural language — the AI agent finds foods, estimates portions, and logs it. |
| Offline-Ready PWA         | `Smartphone`  | Works without internet. Install on your phone like a native app — no app store needed.              |
| Recipe Builder            | `CookingPot`  | Combine ingredients into recipes with auto-calculated nutrition per serving.                        |
| Supplement Tracking       | `Pill`        | Log your daily supplements and see what you've taken at a glance.                                   |

### 3. CTA

- Headline: "Start tracking today"
- Subtext: "Free to use. No credit card. Just sign in and go."
- Single button: "Get Started" → OIDC login

### 4. Footer

Minimal: app name, link to `/privacy`, copyright year. No newsletter, no social links, no multi-column layout.

## Responsive Behavior

- **Mobile**: Single column throughout. Hero text centered. Feature cards stack vertically. Buttons stack on very small screens.
- **Desktop**: Two-column feature grid. Hero can use more horizontal space. Max-width container (~1200px) centered.

## Files Changed

| File                         | Change                                          |
| ---------------------------- | ----------------------------------------------- |
| `src/hooks.server.ts`        | Add `/` to public paths                         |
| `src/routes/+page.svelte`    | New — landing page component                    |
| `src/routes/+page.server.ts` | New — redirect authenticated users to dashboard |
| `messages/en.json`           | Add landing page strings                        |
| `messages/de.json`           | Add landing page strings (German)               |
| `package.json`               | Add `@fontsource-variable/manrope` dependency   |

## Out of Scope

- Pricing page (app is free)
- Newsletter signup
- Social proof / testimonials
- Mobile app mockup section
- Stats bar
- Changes to the existing `/login` page (it stays as a fallback)
