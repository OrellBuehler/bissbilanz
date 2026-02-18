# Roadmap: Bissbilanz

## Overview

This milestone adds three new feature areas to an already-working food tracking application: a favorites system with tap-to-log, weight tracking with trend charts, and supplement schedule check-off UI. The codebase is brownfield — Phase 1 (auth, food CRUD, recipes, entries, goals, MCP, PWA) is already shipped. Before any feature work begins, a shared preferences foundation and breadcrumb/language fixes are needed. Every dashboard widget in this milestone is hideable via user preferences stored in the database.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Language fixes, userPreferences table, and preferences API/settings (completed 2026-02-18)
- [x] **Phase 2: Favorites** - Favorites system with image cards, tap-to-log, and dashboard widget (completed 2026-02-18)
- [ ] **Phase 3: Weight Tracking** - Weight logging, trend chart, and dashboard widget
- [ ] **Phase 4: Supplement Polish** - Wire supplement UI to preferences and complete check-off flow

## Phase Details

### Phase 1: Foundation
**Goal**: Users experience correct breadcrumb navigation and language persistence, and can configure dashboard widget visibility in settings
**Depends on**: Nothing (first phase)
**Requirements**: LANG-01, LANG-02, LANG-03, LANG-04, LANG-05, PREF-01, PREF-02, PREF-03, PREF-04, PREF-05
**Success Criteria** (what must be TRUE):
  1. Breadcrumb always shows the dashboard as the first crumb with no locale prefix in the path
  2. Changing language in the app saves the preference to the user account and the correct language is restored automatically on next login
  3. User can open Settings and toggle visibility of each dashboard widget (favorites, supplements, weight), with the choice persisting across devices and sessions
  4. User can set their preferred start page (dashboard or favorites) in settings, and the PWA opens to that page on launch
  5. Route guard no longer rejects URLs containing fr or it locale segments
**Plans:** 3/3 plans complete

Plans:
- [ ] 01-01-PLAN.md — Schema, preferences API, and route guard cleanup
- [ ] 01-02-PLAN.md — Breadcrumb fix and auth callback locale persistence
- [ ] 01-03-PLAN.md — Settings page UI, language switcher, and PWA start page

### Phase 2: Favorites
**Goal**: Users can mark foods and recipes as favorites, view them as visual cards, and tap to instantly log a serving to the current meal
**Depends on**: Phase 1
**Requirements**: FAV-01, FAV-02, FAV-03, FAV-04, FAV-05, FAV-06, FAV-07, FAV-08, FAV-09
**Success Criteria** (what must be TRUE):
  1. User can toggle the favorite flag on any food or recipe and see the change reflected immediately
  2. The favorites page shows all favorited items as image cards with macro info, sorted by how frequently the item has been logged
  3. Tapping a favorite on the favorites page or dashboard widget logs it to the current meal — either instantly (1 serving) or via a servings picker, depending on the user's configured tap action
  4. Recipes can have an image uploaded; the image is stored as a 400px WebP thumbnail and displayed on the favorite card
  5. After logging from favorites, a toast notification appears with an Undo action that removes the entry if tapped
  6. The dashboard favorites widget shows the top 5 favorites and is visible only when the user has enabled it in settings
**Plans:** 3/3 plans complete

Plans:
- [ ] 02-01-PLAN.md — Schema migration, favorites API with ranking, and image upload backend
- [ ] 02-02-PLAN.md — FavoriteCard component and favorites page with tap-to-log
- [ ] 02-03-PLAN.md — Dashboard widget, AddFoodModal upgrade, and edit page image upload

### Phase 3: Weight Tracking
**Goal**: Users can log their body weight at any time, view their history as a list, and see a trend chart with a smoothed line
**Depends on**: Phase 1
**Requirements**: WGHT-01, WGHT-02, WGHT-03, WGHT-04, WGHT-05, WGHT-06, WGHT-07
**Success Criteria** (what must be TRUE):
  1. User can log their body weight from the dedicated weight page; the entry stores the exact timestamp of logging
  2. User can view all past weight entries in a list and edit or delete any entry
  3. The weight chart displays logged weights as a line with selectable time ranges (7d, 30d, 90d, all) and a 7-day moving average overlay
  4. The dashboard weight widget shows the most recent weight entry and is visible only when the user has enabled it in settings
  5. Weight entries are always stored in kilograms with no unit conversion at the storage layer
**Plans**: TBD

### Phase 4: Supplement Polish
**Goal**: Users can check off supplements from their daily schedule and see today's progress on the dashboard
**Depends on**: Phase 1
**Requirements**: SUPP-01, SUPP-02, SUPP-03, SUPP-04, SUPP-05
**Success Criteria** (what must be TRUE):
  1. User can view today's supplement checklist showing each supplement with its scheduled time of day (morning, noon, evening) and check it off as taken
  2. Checking off a supplement saves a log entry with a timestamp to the supplement_logs table
  3. User can view a history of past days showing which supplements were taken and which were missed
  4. The dashboard supplement widget shows today's checklist and is visible only when the user has enabled it in settings
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/3 | Complete    | 2026-02-18 |
| 2. Favorites | 0/3 | Complete    | 2026-02-18 |
| 3. Weight Tracking | 0/? | Not started | - |
| 4. Supplement Polish | 0/? | Not started | - |
