# Bissbilanz Food Tracking Application - Design Document

**Date:** 2026-02-03
**Project:** Bissbilanz - Food tracking application with AI-assisted logging
**Tech Stack:** SvelteKit, Bun, Drizzle ORM, PostgreSQL, Infomaniak Auth, shadcn-svelte

---

## Overview

Bissbilanz is a calorie and macro tracking application focused on user-created food databases, AI-assisted logging via MCP, and convenience features like barcode scanning, recipes, and meal copying. Authentication is required via Infomaniak OIDC.

---

## Architecture & Tech Stack

### Core Technologies
- **Frontend:** SvelteKit 2.x with Svelte 5
- **Runtime:** Bun (development and production)
- **Database:** PostgreSQL with Drizzle ORM
- **Authentication:** Infomaniak OIDC (login required)
- **UI Components:** shadcn-svelte + Tailwind CSS 4.x
- **PWA:** `@vite-pwa/sveltekit` for offline support
- **Barcode Scanning:** `html5-qrcode`
- **AI Integration:** MCP TypeScript SDK (`@modelcontextprotocol/sdk`)
- **Adapter:** `svelte-adapter-bun` for deployment

### Reference Project
Based on `/home/orell/github/wohnungs-plan` authentication and database setup patterns.

---

## Database Schema

### Users & Authentication (from reference project)

```typescript
// Users (from Infomaniak OIDC)
users: {
  id: uuid (PK)
  infomaniakSub: text (unique, not null)
  email: text
  name: text
  avatarUrl: text
  createdAt: timestamp
  updatedAt: timestamp
}

// Sessions
sessions: {
  id: uuid (PK)
  userId: uuid (FK -> users.id, cascade delete)
  refreshToken: text
  expiresAt: timestamp (not null)
  createdAt: timestamp

  indexes: userId, expiresAt
}
```

### Food Tracking Core

```typescript
// User-created food database
foods: {
  id: uuid (PK)
  userId: uuid (FK -> users.id, cascade delete)
  name: text (not null)
  brand: text (nullable)
  servingSize: real (not null)
  servingUnit: text (not null) // g, ml, piece, cup, etc.

  // Core macros (always tracked)
  calories: real (not null)
  protein: real (not null)
  carbs: real (not null)
  fat: real (not null)
  fiber: real (not null)

  // Extended nutrients (for comprehensive tracking - future)
  sodium: real (nullable)
  sugar: real (nullable)
  saturatedFat: real (nullable)
  // ... more nutrients as needed

  barcode: text (nullable, unique) // optional barcode association
  isFavorite: boolean (default false)

  createdAt: timestamp
  updatedAt: timestamp

  indexes: userId, barcode
}

// Daily food entries
foodEntries: {
  id: uuid (PK)
  userId: uuid (FK -> users.id, cascade delete)
  foodId: uuid (FK -> foods.id, nullable, set null on delete)
  recipeId: uuid (FK -> recipes.id, nullable, set null on delete)

  date: date (not null) // YYYY-MM-DD
  mealType: text (not null) // breakfast, lunch, dinner, snack, or custom
  servings: real (not null) // multiplier for nutrition
  notes: text (nullable)

  createdAt: timestamp
  updatedAt: timestamp

  indexes: userId, date, foodId, recipeId
  check: (foodId IS NOT NULL) OR (recipeId IS NOT NULL)
}

// User daily goals
userGoals: {
  userId: uuid (PK, FK -> users.id, cascade delete)
  calorieGoal: real (not null)
  proteinGoal: real (not null)
  carbGoal: real (not null)
  fatGoal: real (not null)
  fiberGoal: real (not null)
  updatedAt: timestamp
}

// Custom meal categories
customMealTypes: {
  id: uuid (PK)
  userId: uuid (FK -> users.id, cascade delete)
  name: text (not null)
  sortOrder: integer (not null)
  createdAt: timestamp

  indexes: userId
}
```

### Recipes

```typescript
// Recipe definitions
recipes: {
  id: uuid (PK)
  userId: uuid (FK -> users.id, cascade delete)
  name: text (not null)
  totalServings: real (not null) // how many servings recipe makes

  createdAt: timestamp
  updatedAt: timestamp

  indexes: userId
}

// Recipe ingredients (junction table)
recipeIngredients: {
  id: uuid (PK)
  recipeId: uuid (FK -> recipes.id, cascade delete)
  foodId: uuid (FK -> foods.id, cascade delete)
  quantity: real (not null)
  servingUnit: text (not null)
  sortOrder: integer (not null)

  indexes: recipeId, foodId
}
```

---

## Authentication Flow

**Infomaniak OIDC (from reference project pattern):**
- No guest access - login required for all features
- Cookie-based sessions (7-day duration)
- Session middleware validates authentication on all protected routes

**Auth Routes:**
- `GET /api/auth/login` - Redirect to Infomaniak OAuth
- `GET /api/auth/callback` - Handle OAuth callback, create session
- `POST /api/auth/logout` - Destroy session, clear cookie
- `GET /api/auth/me` - Get current user profile

**Client Auth Store:**
- `$lib/stores/auth.svelte.ts` - Svelte 5 runes-based state
- Provides: `getUser()`, `isAuthenticated()`, `login()`, `logout()`

---

## Core Features & Pages

### 1. Landing/Login (`/`)
- Redirects to `/app` if authenticated
- Shows login button if not authenticated
- Minimal landing page with app description

### 2. Dashboard (`/app`)
**Layout:**
- Header: Date selector (← Today →)
- Macro Progress: Circular/linear progress for calories, protein, carbs, fat, fiber
- Meal Sections: Breakfast, Lunch, Dinner, Snacks, Custom categories
- Each meal: List of food entries + "Add Food" button
- Footer: Daily totals summary

**Quick Actions:**
- Scan Barcode (opens camera scanner)
- Copy Yesterday (copies all meals from previous day, editable)
- Add Recipe (quick-add from recipe library)

### 3. Food Database (`/app/foods`)
- Search/filter user's foods
- List view: food name, brand, serving info, macros
- Create new food button
- Edit/delete existing foods
- Mark as favorite (star icon)

**Create/Edit Food Form:**
- Name, brand (optional)
- Serving size + unit (dropdown: g, ml, piece, cup, tbsp, etc.)
- Nutrition inputs: calories, protein, carbs, fat, fiber
- Optional: "Scan Barcode" button to associate barcode
- Save to user's database

### 4. Recipes (`/app/recipes`)
- List user's recipes
- Each recipe: name, servings, total macros per serving
- Create/edit recipe

**Recipe Builder:**
- Recipe name + total servings
- Add ingredients: search user's foods, specify quantity + unit
- Auto-calculate total nutrition, divided by servings
- Preview nutrition per serving
- Save recipe

### 5. History (`/app/history`)
- Calendar view with color indicators:
  - Green: met goals
  - Yellow: under goals
  - Red: over goals
- Click date → view full log for that day
- Stats panel: weekly/monthly averages for each macro

### 6. Goals (`/app/goals`)
- Form to set daily targets:
  - Calorie goal
  - Protein goal (g)
  - Carb goal (g)
  - Fat goal (g)
  - Fiber goal (g)
- Save → updates dashboard progress bars

### 7. Settings (`/app/settings`)
- Manage custom meal categories (add/remove/reorder)
- Account info (from Infomaniak)
- Logout button
- Future: theme, units preference, data export

---

## User Flows

### Adding Food to Daily Log
1. Click "Add Food" on meal section (e.g., Breakfast)
2. Modal/drawer opens with tabs:
   - Search Foods (search user's database)
   - Recent (recently logged foods)
   - Favorites (starred foods)
   - Scan Barcode (camera scanner)
3. Select food → adjust servings (default 1)
4. Meal type pre-selected (from context), editable
5. Optional: add notes
6. Save → entry added to daily log, totals update

### Barcode Scanning Flow
**From Dashboard (quick-add):**
1. Click "Scan Barcode" → camera opens
2. Scan barcode → search user's foods by barcode
3. If found: quick-add modal (confirm servings, meal type)
4. If not found: redirect to "Create Food" with barcode pre-filled

**From Create Food:**
1. In create food form, click "Scan Barcode"
2. Camera opens, scan barcode
3. Barcode value populated in form
4. User fills rest of nutrition info
5. Save → barcode associated with food for future quick-add

### Recipe Creation
1. Navigate to Recipes → "Create Recipe"
2. Enter name + total servings
3. Add ingredients:
   - Search user's foods
   - Specify quantity + unit
   - Add to ingredient list
4. See live calculation of total nutrition per serving
5. Save recipe

### Logging Recipe
1. From dashboard, click "Add Food"
2. Tab: "Recipes"
3. Select recipe → specify servings (e.g., "1 serving")
4. Nutrition auto-calculated (recipe nutrition × servings)
5. Save → logged as single entry (linked to recipe)

### Copy Yesterday's Meal
1. Dashboard → click "Copy Yesterday" or copy icon on meal section
2. Select which meals to copy (Breakfast, Lunch, Dinner, Snacks)
3. Meals copied to today
4. User can edit/delete individual entries

---

## MCP Integration (AI-Assisted Logging)

### MCP Server Setup
- **Endpoint:** `POST /api/mcp`
- **Transport:** Streamable HTTP (from `@modelcontextprotocol/sdk`)
- **Authentication:** Validate session cookie before processing MCP requests
- **Framework:** Express middleware within SvelteKit API route

### MCP Tools

#### 1. `get-daily-status`
**Description:** Get current day's nutrition tracking state
**Input:** None (uses session user + current date)
**Output:**
```typescript
{
  date: string, // YYYY-MM-DD
  meals: [
    {
      mealType: string,
      entries: [
        {
          food: string,
          servings: number,
          calories: number,
          protein: number,
          carbs: number,
          fat: number,
          fiber: number
        }
      ]
    }
  ],
  totals: { calories, protein, carbs, fat, fiber },
  goals: { calories, protein, carbs, fat, fiber },
  remaining: { calories, protein, carbs, fat, fiber }
}
```

#### 2. `create-food`
**Description:** Create new food in user's database
**Input:**
```typescript
{
  name: string,
  brand?: string,
  servingSize: number,
  servingUnit: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
  barcode?: string
}
```
**Output:** `{ foodId: string, success: boolean }`

#### 3. `create-recipe`
**Description:** Create recipe with ingredients
**Input:**
```typescript
{
  name: string,
  totalServings: number,
  ingredients: [
    {
      foodId: string,
      quantity: number,
      servingUnit: string
    }
  ]
}
```
**Output:** `{ recipeId: string, success: boolean }`

#### 4. `log-food`
**Description:** Add food entry to daily log
**Input:**
```typescript
{
  foodId?: string,
  recipeId?: string,
  mealType: string,
  servings: number,
  notes?: string,
  date?: string // defaults to today
}
```
**Output:** `{ entryId: string, success: boolean }`

#### 5. `search-foods`
**Description:** Search user's food database
**Input:** `{ query: string }`
**Output:**
```typescript
{
  foods: [
    {
      id: string,
      name: string,
      brand?: string,
      servingSize: number,
      servingUnit: string,
      calories: number,
      protein: number,
      carbs: number,
      fat: number,
      fiber: number,
      barcode?: string
    }
  ]
}
```

### AI Agent Use Cases
- **User:** "I just ate 2 slices of toast with peanut butter"
  - Agent: `search-foods("toast")` → `search-foods("peanut butter")`
  - If not found: `create-food(...)` for each
  - Then: `log-food(foodId, servings: 2, mealType: "breakfast")`

- **User:** "What have I eaten today?"
  - Agent: `get-daily-status()`
  - Summarizes meals and remaining macros

- **User:** "Create a recipe for my protein shake"
  - Agent: `search-foods("protein powder")`, `search-foods("banana")`, etc.
  - Then: `create-recipe(name: "Protein Shake", ingredients: [...])`

---

## UI/UX Patterns

### Design Principles
- **Mobile-first:** Touch-friendly targets, responsive layout
- **Fast input:** Minimize taps to log food
- **Clarity:** Clear macro progress, simple navigation
- **Offline-capable:** PWA with service worker caching

### Component Library
- **shadcn-svelte** components:
  - Form inputs, buttons, modals/dialogs
  - Progress bars/rings for macro tracking
  - Calendar component for history
  - Tabs for add food modal
  - Dropdown menus

### Color Coding
- **Progress indicators:**
  - Green: within 10% of goal
  - Yellow: 10-20% under goal
  - Red: over goal or >20% under
- **Macro colors:**
  - Calories: Blue
  - Protein: Red
  - Carbs: Orange
  - Fat: Yellow
  - Fiber: Green

### Navigation
- **Desktop:** Sidebar navigation
- **Mobile:** Bottom tab bar or hamburger menu
- **Routes:**
  - Dashboard (home icon)
  - Foods (database icon)
  - Recipes (book icon)
  - History (calendar icon)
  - Settings (gear icon)

### Interactions
- **Swipe gestures:** Swipe left/right to navigate dates on dashboard
- **Pull to refresh:** Refresh daily data
- **Drag to reorder:** Reorder custom meal categories
- **Long press:** Quick actions (edit, delete, favorite)

---

## Progressive Web App (PWA)

### Configuration (`@vite-pwa/sveltekit`)
- **Manifest:** App name, icons, theme colors, display mode
- **Service Worker:** Precache static assets, runtime caching for API
- **Offline Strategy:**
  - Cache user's foods list (IndexedDB)
  - Cache recent food entries
  - Queue pending entries for background sync when online

### Caching Strategy
- **Static assets:** Precache (HTML, CSS, JS, icons)
- **API routes:**
  - `/api/auth/me`: Network-first, fallback to cache
  - `/api/foods`: Cache-first, background update
  - `/api/entries`: Network-first (always fresh data)
- **Food database:** IndexedDB for offline search

### Install Prompts
- Detect iOS Safari vs Android Chrome
- Show custom install prompt after user logs first meal
- Dismiss option with "Don't ask again" preference

---

## Implementation Phases

### Phase 1: Foundation (Basic Setup)
**Goal:** Project scaffolding, auth, basic schema

- Initialize SvelteKit project with Bun
- Install dependencies: Drizzle, shadcn-svelte, Tailwind 4.x
- Configure `drizzle.config.ts`, database connection
- Copy Infomaniak OIDC auth from reference project:
  - `/api/auth/*` routes
  - Session management (`$lib/server/session.ts`)
  - Auth store (`$lib/stores/auth.svelte.ts`)
- Create database schema:
  - `users`, `sessions`, `foods`, `foodEntries`, `userGoals`
- Run migrations with `drizzle-kit`
- Landing page with login
- Authenticated layout with navigation
- **Document in CLAUDE.md:**
  - Tech stack (SvelteKit, Bun, Drizzle, PostgreSQL, Infomaniak)
  - UI framework (shadcn-svelte, Tailwind 4.x)
  - Project structure
  - Development commands

**Deliverable:** User can log in via Infomaniak, see empty dashboard

---

### Phase 2: Core Food Tracking
**Goal:** Basic food logging functionality

- Dashboard page (`/app`):
  - Date selector
  - Meal sections (hardcoded: Breakfast, Lunch, Dinner, Snacks)
  - "Add Food" button per meal
- Food database page (`/app/foods`):
  - List user's foods
  - Create food form (manual entry, no barcode yet)
  - Edit/delete food
- API routes:
  - `GET /api/foods` - list user's foods
  - `POST /api/foods` - create food
  - `PATCH /api/foods/:id` - update food
  - `DELETE /api/foods/:id` - delete food
  - `GET /api/entries?date=YYYY-MM-DD` - get day's entries
  - `POST /api/entries` - log food entry
  - `PATCH /api/entries/:id` - update entry
  - `DELETE /api/entries/:id` - delete entry
- Add food modal:
  - Search user's foods (client-side filter)
  - Select food → adjust servings → save
- Daily totals calculation (sum all entries)
- Goals page (`/app/goals`):
  - Form to set macro goals
  - `GET /api/goals`, `POST /api/goals`
- Dashboard progress bars:
  - Show totals vs goals
  - Color coding (green/yellow/red)

**Deliverable:** User can create foods, log entries, see totals and progress

---

### Phase 3: Convenience Features
**Goal:** Make logging faster and easier

- Recent foods:
  - Track last 10 logged foods per user
  - Show in "Add Food" modal "Recent" tab
- Favorite foods:
  - Add `isFavorite` toggle to food form
  - "Favorites" tab in "Add Food" modal
- Copy food entries:
  - "Copy Yesterday" button on dashboard
  - API: `POST /api/entries/copy?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`
  - Copy all meals, allow editing after
- Custom meal categories:
  - `customMealTypes` table
  - Settings page: add/remove/reorder categories
  - Dashboard: show custom categories alongside default
- Edit/delete logged entries:
  - Edit button on entry → modal to adjust servings/meal type
  - Delete button → confirm dialog

**Deliverable:** Faster logging with favorites, recent, and copying

---

### Phase 4: Recipes
**Goal:** Multi-ingredient meals

- Recipes database page (`/app/recipes`):
  - List user's recipes
  - Show nutrition per serving
- Recipe builder:
  - Form: name, total servings
  - Add ingredients: search foods, specify quantity + unit
  - Live calculation of total nutrition ÷ servings
- API routes:
  - `GET /api/recipes` - list recipes
  - `POST /api/recipes` - create recipe
  - `GET /api/recipes/:id` - get recipe with ingredients
  - `PATCH /api/recipes/:id` - update recipe
  - `DELETE /api/recipes/:id` - delete recipe
- Log recipe entry:
  - "Add Food" modal → "Recipes" tab
  - Select recipe → specify servings
  - Log as single entry (linked to `recipeId`)
- Display recipe entries in dashboard:
  - Show recipe name instead of food name
  - Expand to show ingredients (optional)

**Deliverable:** Create and log recipes

---

### Phase 5: History & Stats
**Goal:** View past data and trends

- History page (`/app/history`):
  - Calendar component (month view)
  - Color-code days based on goal achievement
  - Click day → navigate to that date
- Daily log view for past dates:
  - Reuse dashboard layout with read-only entries
  - Show totals and goal progress for that day
- Stats panel:
  - Weekly averages (last 7 days)
  - Monthly averages (last 30 days)
  - Macro breakdown (pie chart or bar chart)
- API routes:
  - `GET /api/stats/weekly` - averages for last 7 days
  - `GET /api/stats/monthly` - averages for last 30 days
  - `GET /api/entries/range?startDate=X&endDate=Y` - entries for date range

**Deliverable:** Browse history, see weekly/monthly stats

---

### Phase 6: Barcode Scanning
**Goal:** Quick food lookup via barcode

- Install `html5-qrcode` package
- Barcode scanner component:
  - Camera permission handling
  - Scan barcode → return value
- Create food with barcode:
  - "Scan Barcode" button in food form
  - Open camera scanner
  - Populate `barcode` field on successful scan
  - User fills rest of nutrition info
  - Save with barcode association
- Quick-add via barcode:
  - "Scan Barcode" button on dashboard
  - Scan → search user's foods by barcode
  - If found: quick-add modal (confirm servings, meal type)
  - If not found: redirect to create food with barcode pre-filled
- API:
  - `GET /api/foods?barcode=123456` - search by barcode
- Handle duplicate barcodes:
  - Unique constraint on barcode
  - UI feedback if barcode already exists

**Deliverable:** Scan barcodes to add/log foods quickly

---

### Phase 7: MCP Integration
**Goal:** AI-assisted logging via MCP tools

- Install `@modelcontextprotocol/sdk`
- MCP server setup:
  - `/api/mcp` POST endpoint
  - Express middleware for Streamable HTTP transport
  - Session authentication (validate cookie)
- Register MCP tools:
  - `get-daily-status`
  - `create-food`
  - `create-recipe`
  - `log-food`
  - `search-foods`
- Implement tool handlers:
  - Reuse existing business logic (create food, log entry, etc.)
  - Return structured responses per MCP spec
- Testing:
  - Test with MCP client (Claude Desktop or custom client)
  - Validate session handling
  - Error handling (invalid inputs, DB errors)

**Deliverable:** AI agents can query status, create foods/recipes, log entries

---

### Phase 8: PWA & Polish
**Goal:** Offline support, installable app

- Configure `@vite-pwa/sveltekit`:
  - Generate manifest.json (app name, icons, theme)
  - Create service worker with precaching
  - Runtime caching strategies
- Offline caching:
  - Cache user's foods in IndexedDB
  - Cache recent entries
  - Queue pending writes for background sync
- Install prompts:
  - Detect platform (iOS/Android)
  - Show custom install banner
  - "Add to Home Screen" instructions
- App icons and splash screens:
  - Generate icons (512x512, 192x192, etc.)
  - Configure theme colors
- Loading states and skeletons:
  - Skeleton screens for data loading
  - Optimistic UI updates
- Error handling:
  - Toast notifications for errors
  - Retry mechanisms for failed requests

**Deliverable:** Installable PWA with offline support

---

### Phase 9: Advanced Nutrients (Optional/Future)
**Goal:** Comprehensive nutrient tracking

- Extend `foods` schema:
  - Add columns: `sodium`, `sugar`, `saturatedFat`, `transFat`, `cholesterol`, `vitaminA`, `vitaminC`, `calcium`, `iron`, etc.
- UI toggles:
  - Settings: "Show advanced nutrients" checkbox
  - Food form: collapsible "Advanced Nutrients" section
  - Dashboard: optional detailed nutrient view
- Extended goals:
  - Allow setting goals for additional nutrients
  - Progress bars for tracked nutrients
- Stats and history:
  - Include advanced nutrients in averages
  - Filter/group by nutrient

**Deliverable:** Optional comprehensive nutrient tracking

---

## Technical Considerations

### Database Performance
- **Indexes:**
  - `foods`: `(userId)`, `(barcode)` unique
  - `foodEntries`: `(userId, date)`, `(foodId)`, `(recipeId)`
  - `sessions`: `(userId)`, `(expiresAt)`
  - `recipes`: `(userId)`
- **Queries:**
  - Use `date` index for daily/range queries
  - Preload user's foods on dashboard load
  - Paginate history (load one month at a time)
- **Connection Pooling:**
  - Configure Drizzle with Postgres.js connection pool
  - Set max connections based on deployment

### Calculation Strategy
- **Macro totals:**
  - Option 1: Calculate client-side (fetch entries, sum in JS)
  - Option 2: Database aggregation (SUM in SQL query)
  - **Recommendation:** Client-side for daily (fewer entries), DB for history/stats
- **Recipe nutrition:**
  - Calculate on recipe creation, store per serving
  - Recalculate if ingredients change
  - Cache in `recipes` table for performance

### Error Handling
- **Database errors:**
  - Unique constraint violations (duplicate barcode)
  - Foreign key violations (deleted food/recipe)
  - Return user-friendly error messages
- **MCP errors:**
  - Invalid tool inputs → return error in MCP response
  - Authentication failures → 401 Unauthorized
  - Rate limiting → 429 Too Many Requests
- **Client errors:**
  - Toast notifications for user-facing errors
  - Retry logic for network failures
  - Fallback UI for offline mode

### Security
- **Authentication:**
  - All routes except `/api/auth/*` require valid session
  - Session cookie: HttpOnly, Secure (in production), SameSite=Lax
- **Input validation:**
  - Validate all user inputs (Zod schemas)
  - Sanitize food names, notes (prevent XSS)
  - Validate numeric inputs (no negative macros)
- **Authorization:**
  - Users can only access their own data
  - Check `userId` in all queries
- **MCP endpoint:**
  - Validate session before processing tools
  - Rate limiting (e.g., 100 requests/min per user)
  - Log MCP requests for monitoring

### Environment Variables

```bash
# Infomaniak OIDC
INFOMANIAK_CLIENT_ID=your-client-id
INFOMANIAK_CLIENT_SECRET=your-client-secret
INFOMANIAK_REDIRECT_URI=http://localhost:5173/api/auth/callback

# Database
DATABASE_URL=postgres://user:password@localhost:5432/bissbilanz

# Session
SESSION_SECRET=generate-random-32-byte-string-here

# App
PUBLIC_APP_URL=http://localhost:5173

# MCP (optional)
MCP_ENDPOINT_ENABLED=true
```

### Deployment
- **Adapter:** `svelte-adapter-bun` for production builds
- **Docker:**
  - Use official Bun image
  - Multi-stage build (build + runtime)
  - Persistent volume for uploads (if adding meal photos)
- **Environment:**
  - Set `NODE_ENV=production`
  - Use secrets management for sensitive env vars
  - Configure PostgreSQL with SSL in production
- **Monitoring:**
  - Log MCP requests and errors
  - Track daily active users
  - Monitor database query performance

### Testing Strategy
- **Unit tests:**
  - Macro calculation functions
  - Nutrition per serving calculations
  - Date utilities
- **Integration tests:**
  - API routes (foods, entries, recipes, goals)
  - MCP tools (mock session, DB)
- **E2E tests:**
  - Login flow
  - Create food → log entry
  - Create recipe → log recipe
  - Barcode scan → quick-add
- **Tools:**
  - Vitest for unit/integration
  - Playwright for E2E

---

## Future Enhancements (Post-MVP)

### Additional Tracking
- Water intake tracking
- Body weight logging with trend charts
- Exercise/activity tracking
- Meal photos (upload with entry)

### Social Features
- Share recipes with other users
- Public recipe library
- Friends/family sharing (view each other's progress)

### Integrations
- Export data (CSV, JSON)
- Import from MyFitnessPal, Cronometer
- Sync with fitness trackers (Fitbit, Apple Health)

### Advanced Features
- Meal planning (plan future days)
- Shopping list generation from meal plan
- Nutrition insights (AI-generated recommendations)
- Custom nutrient goals (per meal, per day)
- Macro cycling (different goals per day)

### Gamification
- Streak tracking (consecutive days logging)
- Achievements/badges
- Progress photos with before/after

---

## Success Criteria

**MVP (Phase 1-6):**
- User can log in via Infomaniak
- Create and manage personal food database
- Log food entries with macro tracking
- Set and track daily macro goals
- Create and log recipes
- View history and weekly/monthly stats
- Quick-add via favorites, recent, barcode scanning

**Full Release (Phase 1-8):**
- All MVP features
- MCP integration for AI-assisted logging
- PWA with offline support
- Installable on mobile devices
- Fast, responsive UI
- Comprehensive test coverage

**Metrics:**
- User can log a meal in < 30 seconds
- Dashboard loads in < 1 second
- Offline mode works for viewing/adding foods
- 95%+ uptime for MCP endpoint

---

## Open Questions

1. **Food database seeding:** Should we provide a small starter database of common foods, or strictly user-created?
   - **Decision pending:** Start with user-created only for simplicity, consider seeding later

2. **Barcode API fallback:** If user scans unknown barcode, should we attempt to fetch nutrition data from external API (e.g., Open Food Facts)?
   - **Decision pending:** Phase 6 implementation, may add as enhancement

3. **MCP authentication:** Should MCP endpoint support API keys in addition to session cookies?
   - **Decision pending:** Start with session cookies, add API keys if needed for external integrations

4. **Multi-user recipes:** Should recipes be shareable between users or always private?
   - **Decision pending:** Start private, add sharing in future phase

5. **Data export:** What formats to support (CSV, JSON, PDF)?
   - **Decision pending:** CSV for MVP, add others in future

---

## References

- Reference project: `/home/orell/github/wohnungs-plan`
- MCP TypeScript SDK: `@modelcontextprotocol/sdk`
- Barcode library: `html5-qrcode`
- UI components: shadcn-svelte
- PWA plugin: `@vite-pwa/sveltekit`

---

**Document Status:** ✅ Approved for implementation
**Next Steps:**
1. Write to CLAUDE.md
2. Setup git worktree (optional)
3. Create implementation plan
4. Begin Phase 1 implementation
