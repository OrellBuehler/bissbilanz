# Release Notes — Pre-Production Testing

## Overview of Changes

This release includes 6 new features merged from separate branches, along with bug fixes and test improvements.

### New Features

1. **Logging Streaks** (PR #31)
   - Dashboard widget showing current and longest logging streak
   - "Personal Best" badge when current equals longest
   - API: `GET /api/stats/streaks`

2. **Calendar Heatmap** (PR #32)
   - Monthly calendar on the History page with color-coded days
   - Green = on-target, amber = off-target, blue = logged, gray = no data
   - Clickable days navigate to that date's history

3. **Top Foods Widget** (PR #33)
   - Dashboard widget showing top 3 most-logged foods from the last 7 days
   - Ranking, count, and average calories per serving
   - Toggleable via Settings
   - API: `GET /api/stats/top-foods`

4. **Meal Breakdown Widget** (PR #34)
   - Pie chart showing calorie distribution across meals (Breakfast, Lunch, Dinner, Snacks)
   - Total calories displayed in chart center
   - Toggleable via Settings
   - API: `GET /api/stats/meal-breakdown`

5. **Maintenance Calorie Calculator** (PR #59)
   - New `/maintenance` page calculating maintenance calories from weight trend + food log
   - Date range presets (2w, 4w, 8w, 12w) or custom picker
   - Adjustable muscle/fat ratio slider
   - Shows daily surplus/deficit breakdown

6. **Past/Future Date Logging** (#60)
   - Date navigator on dashboard with prev/next arrows and calendar popup
   - "Go to Today" button when viewing a different date
   - All meal logging, supplements, and entries work for any date
   - URL reflects selected date: `/?date=YYYY-MM-DD`

### Bug Fixes & Improvements

- Foods page now uses server-side search and removes the 100-item limit
- Foods and recipes are fetched once on load instead of on every date change
- Dead state (`scannedFood`/`scannedBarcode`) removed from DayLog
- Delete dialog titles and alignment improved
- Test mock pollution fixed (8 test files had incomplete db mocks)
- Playwright e2e tests excluded from Bun test runner

---

## QA Testing Checklist

### Dashboard & Navigation

- [ ] Dashboard loads without errors
- [ ] Dashboard sections can be reordered via Settings
- [ ] Date navigator: tap left/right arrows to change date
- [ ] Date navigator: tap date label to open calendar popup, pick a date
- [ ] "Go to Today" button appears when viewing a non-today date
- [ ] URL updates to `/?date=YYYY-MM-DD` when changing date

### Logging Streaks Widget

- [ ] Streak widget displays on dashboard (if enabled in Settings)
- [ ] Shows current streak (days) and longest streak
- [ ] Logging food today updates the current streak
- [ ] Missing a day resets current streak to 0
- [ ] "Personal Best" badge shows when current = longest

### Calendar Heatmap (History Page)

- [ ] Navigate to `/history` — monthly calendar renders
- [ ] Days with on-target calories show green
- [ ] Days with off-target calories show amber
- [ ] Days with logged food but no goal show blue
- [ ] Days with no data show gray
- [ ] Clicking a day navigates to that date's detail
- [ ] Month navigation (prev/next) works
- [ ] Legend appears below calendar when data exists

### Top Foods Widget

- [ ] Widget shows on dashboard (if enabled in Settings)
- [ ] Displays top 3 foods from last 7 days
- [ ] Shows ranking badge, food name, count, calories
- [ ] "See More" link navigates to `/insights`
- [ ] Empty state when no foods logged recently

### Meal Breakdown Widget

- [ ] Widget shows on dashboard (if enabled in Settings)
- [ ] Pie chart renders with correct meal colors
- [ ] Total calories shown in chart center
- [ ] Tooltip shows meal name and calories on hover/tap
- [ ] Empty state when no entries for the day

### Settings — Widget Toggles

- [ ] Settings page shows toggles for: Streaks, Calendar, Top Foods, Meal Breakdown
- [ ] Toggling a widget off hides it from dashboard
- [ ] Toggling it back on shows it again
- [ ] Preferences persist across page reloads

### Maintenance Calculator

- [ ] Navigate to `/maintenance`
- [ ] Select a date range preset (2w, 4w, 8w, 12w)
- [ ] Use custom date picker for start/end dates
- [ ] Adjust muscle/fat ratio slider
- [ ] Tap "Calculate" — results appear
- [ ] Error shown when <2 weight entries or 0 food days in range
- [ ] Warning shown when data coverage <70%
- [ ] Results show: maintenance kcal, daily surplus/deficit, weight change, breakdown
- [ ] Both German and English locales display correctly

### Past/Future Date Logging

- [ ] Navigate to a past date via arrows or calendar
- [ ] Log a food entry for the past date — it saves correctly
- [ ] Supplements checklist loads for the selected date
- [ ] Navigate to a future date — logging works
- [ ] Return to today — existing entries are intact

### Foods Page

- [ ] Search works (server-side, no 100-item cap)
- [ ] Create, edit, delete food works
- [ ] Barcode scanning works
- [ ] Food list refreshes after mutations

### Insights Page (`/insights`)

- [ ] Top foods section with 7d/30d toggle
- [ ] Meal breakdown for current day and 7-day range
- [ ] All charts render without errors

### General

- [ ] All pages load in both English and German
- [ ] PWA works offline (cached pages load)
- [ ] Mobile layout — no horizontal overflow on any page (320px–393px)
- [ ] No console errors during normal usage
