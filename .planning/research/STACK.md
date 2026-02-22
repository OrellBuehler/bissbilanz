# Stack Research — Supplement Tracking, Weight Trend Charts, Favorites Cards

**Research date:** 2026-02-17
**Research type:** Project — Stack dimension
**Milestone context:** Subsequent milestone — supplement scheduling/check-off, weight logging with trend chart, favorites image cards

---

## Research Question

What libraries and tools are needed for supplement tracking, weight trend charts, and image-based favorites cards in a SvelteKit app?

---

## Existing Stack (Do Not Re-Research)

Already in `package.json` and confirmed installed:

| Package                 | Version       | Role                                    |
| ----------------------- | ------------- | --------------------------------------- |
| SvelteKit               | 2.50.1        | Full-stack framework                    |
| Svelte                  | 5.48.2        | Component model (runes)                 |
| Drizzle ORM             | 0.45.1        | Database ORM                            |
| PostgreSQL              | —             | Database                                |
| Tailwind CSS            | 4.1.18        | Styling                                 |
| shadcn-svelte (bits-ui) | 2.15.5        | UI primitives                           |
| layerchart              | 2.0.0-next.43 | Charts — already installed              |
| svelte-sonner           | 1.0.7         | Toast notifications — already installed |
| Zod                     | 4.3.6         | Runtime validation                      |
| Paraglide JS            | 2.10.0        | i18n (en + de)                          |
| lucide-svelte           | 0.561.0       | Icons                                   |
| vaul-svelte             | 1.0.0-next.7  | Drawer/bottom-sheet                     |

---

## Feature Analysis

### Feature 1: Supplement Tracking (Schedule + Daily Check-off)

**What's needed:** DB schema (already done — `supplements` + `supplement_logs` tables), server module, API routes, UI components (checklist card, management form, history table).

**UI primitives required:** Checkbox (shadcn-svelte), Switch (shadcn-svelte), Dialog (shadcn-svelte), Select (shadcn-svelte). All already available via bits-ui.

**Finding:** No new libraries needed. The supplement feature is entirely implementable with the existing stack. The supplement schema, validation, server module, and API routes are already committed to the codebase (confirmed by git log and schema inspection).

---

### Feature 2: Weight Trend Chart (Line Chart Over Time)

**What's needed:** A line chart component that plots weight (y-axis, real number) against date (x-axis, time scale). Single data series. Interactive tooltip showing exact weight + date.

**Library decision: layerchart 2.0.0-next.43 (already installed)**

Confidence: HIGH

Rationale:

- Already installed. Adding another chart library would add bundle weight and API inconsistency.
- layerchart provides `Chart`, `Svg`, `Line`, `Area`, `Axis`, `Tooltip` components that compose directly to a weight trend line chart.
- Uses D3 scales (`scaleTime`, `scaleLinear`) for x/y axes — already a transitive dependency of layerchart.
- Confirmed API shape from Context7 docs:

```svelte
<Chart {data} x="date" xScale={scaleTime()} y="weight" yScale={scaleLinear()} yNice>
	<Svg>
		<Axis placement="bottom" />
		<Axis placement="left" />
		<Line stroke="steelblue" strokeWidth={2} curve={curveMonotoneX} />
	</Svg>
	<Tooltip.Root>...</Tooltip.Root>
</Chart>
```

- `curveMonotoneX` from `d3-shape` gives smooth trend lines appropriate for body weight data.

**D3 sub-packages needed (transitive, already bundled with layerchart):**

- `d3-scale` (scaleTime, scaleLinear)
- `d3-shape` (curveMonotoneX)
- `d3-time` (date axis formatting)

No additional D3 packages need to be explicitly installed; layerchart bundles them as peer dependencies.

**NOT recommended:**

- Chart.js / react-chartjs-2: React-specific, not Svelte-native
- Recharts: React-only
- ApexCharts: Framework-agnostic but heavier (100+ kB), no Svelte 5 runes integration
- Victory: React-only
- Reason: layerchart already in the project. Adding a second chart library is wasteful.

**Weight DB schema (not yet in schema.ts — needs to be added):**

```typescript
// weightLogs table — new table needed
export const weightLogs = pgTable(
	'weight_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		weightKg: real('weight_kg').notNull(),
		loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(), // full timestamp per user request
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_weight_logs_user_id').on(table.userId),
		index('idx_weight_logs_user_logged_at').on(table.userId, table.loggedAt)
	]
);
```

Note: The schema uses `loggedAt` (full timestamp) not just `date`, per the project decision that users log weight at any time and store time of logging.

---

### Feature 3: Favorites with Image Cards

**What's needed:**

1. `isFavorite` flag on `foods` table — already in schema (confirmed: `isFavorite: boolean`)
2. `isFavorite` + `imageUrl` fields on `recipes` table — NOT yet in schema (needs migration)
3. `userPreferences` table — NOT yet in schema (needs migration)
4. Server-side image resize on upload
5. Visual card component with image + macro bar

#### 3a. Image Upload and Resize: sharp

**Recommendation: sharp ^0.34.x**

Confidence: HIGH

- Current version as of 2026-02: **0.34.5**
- Install: `bun add sharp && bun add -d @types/sharp`
- Used server-side only (`src/lib/server/uploads.ts`) — no browser bundle impact
- Provides: resize to 400×400px, convert to WebP, quality control
- Bun compatible: sharp uses native binaries; Bun supports Node.js native addons
- Minimal API surface needed:

```typescript
import sharp from 'sharp';
await sharp(buffer).resize(400, 400, { fit: 'cover' }).webp({ quality: 80 }).toFile(filepath);
```

**NOT recommended:**

- jimp: Pure JS, slower, worse quality for production use
- Squoosh (CLI): Not a Node.js library, CLI tool only
- Canvas API (node-canvas): Much more complex for this simple resize+convert use case

**File storage decision: local filesystem (`static/uploads/`)**

- Per project constraints: "Image storage: Local filesystem, not cloud storage"
- Files served as static assets by SvelteKit/Bun
- `.gitignore` must exclude `static/uploads/`

#### 3b. Favorites Card UI: No new library needed

**Recommendation: Pure Tailwind + shadcn-svelte primitives**

Confidence: HIGH

The `FavoriteCard` component needs:

- Image display with fallback (standard `<img>` + `<div>` fallback)
- Macro ratio bar (colored `<div>` elements with inline `style` width percentages)
- Food/Recipe type badge (absolutely positioned `<span>`)
- Tap interaction (`<button>` element)

All achievable with Tailwind CSS + existing shadcn-svelte `Card` and `Badge` components. No additional UI library needed.

For the horizontal scroll strip on the dashboard widget: Tailwind `overflow-x-auto flex gap-3` is sufficient. Embla Carousel (already installed) is an option but is overkill for a simple scrollable row.

#### 3c. Toast Notifications (tap-to-log feedback + undo): svelte-sonner (already installed)

**Recommendation: svelte-sonner ^1.0.7 (already installed)**

Confidence: HIGH

The favorites tap-to-log flow shows a toast with an "Undo" action button. `svelte-sonner` (already in `package.json` at `^1.0.7`) handles this exactly:

```typescript
import { toast } from 'svelte-sonner';

toast.success('Logged to Breakfast', {
	action: {
		label: 'Undo',
		onClick: async () => {
			await fetch(`/api/entries/${entry.id}`, { method: 'DELETE' });
		}
	}
});
```

No additional toast library needed.

---

## Summary: New Libraries Required

| Library      | Version | Feature                               | Status                                              | Confidence |
| ------------ | ------- | ------------------------------------- | --------------------------------------------------- | ---------- |
| sharp        | ^0.34.5 | Recipe image resize to WebP on upload | NOT YET INSTALLED — needs `bun add sharp`           | HIGH       |
| @types/sharp | ^0.33.x | TypeScript types for sharp            | NOT YET INSTALLED — needs `bun add -d @types/sharp` | HIGH       |

**Everything else is already in the project.** No other new libraries are needed for any of the three features.

---

## Libraries Already Present That Cover Each Feature

| Feature                        | Library                                  | Already Installed    |
| ------------------------------ | ---------------------------------------- | -------------------- |
| Supplement checklist UI        | shadcn-svelte Checkbox, Switch, Dialog   | Yes (bits-ui 2.15.5) |
| Supplement schedule logic      | Pure TypeScript utility (no library)     | N/A                  |
| Weight line chart              | layerchart 2.0.0-next.43                 | Yes                  |
| Weight time axis               | d3-scale, d3-time (via layerchart)       | Yes (transitive)     |
| Weight smooth curve            | d3-shape curveMonotoneX (via layerchart) | Yes (transitive)     |
| Favorites card UI              | Tailwind CSS + shadcn-svelte             | Yes                  |
| Image display with fallback    | Native HTML img element                  | N/A                  |
| Tap-to-log toast with undo     | svelte-sonner 1.0.7                      | Yes                  |
| Bottom sheet (servings picker) | vaul-svelte 1.0.0-next.7                 | Yes                  |
| Macro ratio bar                | Pure Tailwind flex divs                  | N/A                  |

---

## What NOT to Add

| Library                            | Reason Not to Add                                             |
| ---------------------------------- | ------------------------------------------------------------- |
| Chart.js                           | React ecosystem, no Svelte 5 integration                      |
| ApexCharts                         | 100+ kB extra bundle; layerchart already present              |
| Recharts                           | React-only                                                    |
| Additional icon set                | lucide-svelte already covers Pill, Heart, Scale, Weight icons |
| Cloud storage SDK (S3, Cloudinary) | Project constraint: local filesystem storage only             |
| A second image processing library  | sharp is the standard; one library is enough                  |
| svelte-dnd-action                  | Drag-and-drop reordering of supplements not in scope for v1   |

---

## Schema Changes Needed (Not Yet Done)

These are schema gaps discovered during research, not library questions. Documented here for completeness:

1. **`recipes` table**: Add `isFavorite boolean default false` and `imageUrl text` columns
2. **`weightLogs` table**: New table (see DDL above) — `id`, `userId`, `weightKg`, `loggedAt`, `notes`, `createdAt`
3. **`userPreferences` table**: New table with `showFavoritesOnDashboard boolean default true`, `favoriteTapAction text default 'instant'`, `showSupplementsOnDashboard boolean default true`, `showWeightOnDashboard boolean default true`

Note: `foods.isFavorite` is already in schema (confirmed in `src/lib/server/schema.ts` line 84).

---

## Installation Commands

```bash
# Only new dependency needed for this milestone:
bun add sharp
bun add -d @types/sharp
```

---

## Version Verification

| Package                     | Version Researched        | Source                               | Date       |
| --------------------------- | ------------------------- | ------------------------------------ | ---------- |
| sharp                       | 0.34.5                    | npm registry via WebSearch           | 2026-02-17 |
| layerchart                  | 2.0.0-next.43             | node_modules/layerchart/package.json | 2026-02-17 |
| svelte-sonner               | 1.0.7                     | package.json                         | 2026-02-17 |
| d3-scale, d3-shape, d3-time | transitive via layerchart | layerchart package.json deps         | 2026-02-17 |

---

_Research completed: 2026-02-17_
