# Bissbilanz - Food Tracking Application

A calorie and macro tracking application with AI-assisted logging via MCP integration.

## Project Overview

Bissbilanz is a food tracking application that allows users to:
- Track calories and macros (protein, carbs, fat, fiber)
- Create and manage a personal food database
- Build recipes with multiple ingredients
- Log daily food entries organized by meals
- Set and track daily macro goals
- Scan barcodes to quickly add foods
- Use AI agents via MCP to assist with logging
- Access the app offline via PWA

**Authentication:** Required via Infomaniak OIDC (no guest access)

## Tech Stack

### Core
- **Frontend:** SvelteKit 2.x with Svelte 5 (runes)
- **Runtime:** Bun (development and production)
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM with drizzle-kit
- **Authentication:** Infomaniak OIDC
- **Deployment:** svelte-adapter-bun

### UI & Styling
- **Components:** shadcn-svelte
- **Styling:** Tailwind CSS 4.x
- **Icons:** lucide-svelte

### Features
- **PWA:** @vite-pwa/sveltekit
- **Barcode Scanning:** html5-qrcode
- **AI Integration:** @modelcontextprotocol/sdk (MCP TypeScript SDK)

### Development
- **Type Checking:** TypeScript 5.x
- **Package Manager:** Bun
- **Code Quality:** svelte-check

## Project Structure

```
bissbilanz/
├── src/
│   ├── lib/
│   │   ├── components/      # Svelte components
│   │   │   ├── auth/        # Auth-related components
│   │   │   ├── foods/       # Food database components
│   │   │   ├── entries/     # Food entry components
│   │   │   ├── recipes/     # Recipe components
│   │   │   └── ui/          # shadcn-svelte components
│   │   ├── server/          # Server-side code
│   │   │   ├── db.ts        # Database connection & schema exports
│   │   │   ├── schema.ts    # Drizzle schema definitions
│   │   │   ├── session.ts   # Session management
│   │   │   ├── env.ts       # Environment config
│   │   │   └── mcp/         # MCP server implementation
│   │   ├── stores/          # Svelte stores (runes)
│   │   │   └── auth.svelte.ts
│   │   └── utils/           # Utility functions
│   ├── routes/
│   │   ├── api/
│   │   │   ├── auth/        # Auth endpoints (login, callback, logout, me)
│   │   │   ├── foods/       # Food CRUD endpoints
│   │   │   ├── entries/     # Food entry endpoints
│   │   │   ├── recipes/     # Recipe endpoints
│   │   │   ├── goals/       # Goals endpoints
│   │   │   ├── stats/       # Stats/analytics endpoints
│   │   │   └── mcp/         # MCP endpoint
│   │   ├── app/             # Authenticated pages
│   │   │   ├── +page.svelte # Dashboard
│   │   │   ├── foods/       # Food database page
│   │   │   ├── recipes/     # Recipes page
│   │   │   ├── history/     # History page
│   │   │   ├── goals/       # Goals page
│   │   │   └── settings/    # Settings page
│   │   └── +page.svelte     # Landing/login page
│   ├── app.html
│   └── hooks.server.ts      # Session middleware
├── drizzle/                 # Database migrations
├── docs/
│   └── plans/               # Design & implementation plans
├── static/                  # Static assets (icons, manifest)
├── tests/                   # Test files
├── .env.example
├── drizzle.config.ts
├── package.json
├── svelte.config.js
├── tailwind.config.ts
├── tsconfig.json
└── vite.config.ts
```

## Database Schema

### Core Tables
- **users** - User accounts (from Infomaniak OIDC)
- **sessions** - Authentication sessions
- **foods** - User-created food database (with optional barcode)
- **foodEntries** - Daily food log entries
- **recipes** - User-created recipes
- **recipeIngredients** - Recipe ingredient mappings
- **userGoals** - Daily macro goals per user
- **customMealTypes** - Custom meal categories per user

See `docs/plans/2026-02-03-bissbilanz-food-tracking-design.md` for detailed schema.

## Development Commands

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Type checking
bun run check
bun run check:watch

# Build for production
bun run build

# Preview production build
bun run preview

# Database operations
bun run db:generate    # Generate migrations from schema
bun run db:push        # Push schema to database (dev)
bun run db:migrate     # Run migrations (production)
bun run db:studio      # Open Drizzle Studio

# Testing
bun test
bun test:e2e
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Infomaniak OIDC
INFOMANIAK_CLIENT_ID=your-client-id
INFOMANIAK_CLIENT_SECRET=your-client-secret
INFOMANIAK_REDIRECT_URI=http://localhost:5173/api/auth/callback

# Database
DATABASE_URL=postgres://user:password@localhost:5432/bissbilanz

# Session
SESSION_SECRET=generate-random-32-byte-string

# App
PUBLIC_APP_URL=http://localhost:5173

# MCP (optional)
MCP_ENDPOINT_ENABLED=true
```

## Authentication Flow

1. User visits app → redirected to `/` (landing page)
2. Click "Login" → redirected to Infomaniak OAuth
3. User authorizes → callback to `/api/auth/callback`
4. Server creates session, sets HttpOnly cookie
5. Redirect to `/app` (dashboard)
6. All `/app/*` routes protected by session middleware

**Session duration:** 7 days
**Cookie:** HttpOnly, Secure (production), SameSite=Lax

## MCP Integration

The app exposes an MCP endpoint at `/api/mcp` for AI-assisted logging.

### Available Tools
- `get-daily-status` - Get current day's nutrition state
- `create-food` - Create new food in user's database
- `create-recipe` - Create recipe with ingredients
- `log-food` - Add food entry to daily log
- `search-foods` - Search user's food database

**Authentication:** MCP requests must include valid session cookie

See design document for detailed MCP tool schemas.

## Key Features

### Phase 1 (Foundation) - ✅ Complete
- ✅ SvelteKit + Bun project setup
- ✅ Infomaniak OIDC authentication
- ✅ PostgreSQL database with Drizzle ORM
- ✅ Complete database schema (users, sessions, foods, recipes, entries, goals)
- ✅ Session management middleware
- ✅ Auth API endpoints (login, callback, logout, me)
- ✅ Client-side auth store with Svelte 5 runes
- ✅ Protected route structure (/app/*)
- ✅ Basic authenticated layout with navigation
- ✅ Docker build and deployment configuration
- ✅ CI/CD workflows (build, push, deploy)

### Phase 2 (Core Tracking) - Planned
- Dashboard with meal sections
- Create/manage food database
- Log food entries
- Daily macro totals
- Set and track goals

### Phase 3+ (Future)
- Favorites & recent foods
- Meal copying
- Recipes
- History & stats
- Barcode scanning
- MCP integration
- PWA with offline support

See `docs/plans/` for detailed implementation plans.

## Code Conventions

### TypeScript
- Use strict type checking
- Prefer `type` over `interface` for object shapes
- Use Zod for runtime validation (API inputs, MCP tool schemas)

### Svelte
- Use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- Component files: PascalCase.svelte
- Prefer composition over complex components

### Database
- Use Drizzle ORM exclusively (no raw SQL unless necessary)
- Run `bun run db:generate` after schema changes
- Use `bun run db:push` in development
- Use migrations in production

### API Routes
- Validate inputs with Zod schemas
- Return consistent error format: `{ error: string }`
- Always check user authentication/authorization
- Use HTTP status codes correctly (200, 201, 400, 401, 404, 500)

### Styling
- Use Tailwind utility classes
- Use shadcn-svelte components for UI primitives
- Mobile-first responsive design
- Follow color coding: Calories=Blue, Protein=Red, Carbs=Orange, Fat=Yellow, Fiber=Green

## Git Workflow

- **IMPORTANT:** Always commit changes when work is complete
- **IMPORTANT:** NEVER include "Co-Authored-By" in commit messages

### Commit Messages
- Use conventional commit format: `type: description`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- Keep messages concise and descriptive

Examples:
```
feat: add food database CRUD endpoints
fix: correct macro calculation for recipes
docs: update CLAUDE.md with MCP integration details
refactor: extract macro calculation to utility function
```

### Branching
- `main` - production-ready code
- Feature branches: `feature/food-logging`, `feature/barcode-scanning`
- Use git worktrees for isolated development

## Testing Strategy

### Unit Tests
- Macro calculation functions
- Nutrition per serving calculations
- Date utilities
- Use Vitest

### Integration Tests
- API route handlers
- Database operations
- MCP tools
- Mock authentication

### E2E Tests
- Critical user flows (login, add food, log entry)
- Use Playwright
- Test on mobile viewport

## Deployment

### Production Build
```bash
bun run build
```

### Docker
- Use official Bun image
- Multi-stage build
- Configure PostgreSQL with SSL
- Set environment variables via secrets

### Monitoring
- Log MCP requests and errors
- Track database query performance
- Monitor session creation/expiration

## Reference Project

Authentication and session management patterns based on:
`/home/orell/github/wohnungs-plan`

Key files to reference:
- `/src/lib/server/session.ts` - Session management
- `/src/lib/server/schema.ts` - User & session schema
- `/src/lib/stores/auth.svelte.ts` - Client auth store
- `/src/routes/api/auth/*` - Auth routes

## Resources

- [SvelteKit Docs](https://kit.svelte.dev)
- [Drizzle ORM Docs](https://orm.drizzle.team)
- [shadcn-svelte](https://shadcn-svelte.com)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Infomaniak OIDC](https://developer.infomaniak.com)

## Support

For questions about the codebase, check:
1. This CLAUDE.md file
2. Design document: `docs/plans/2026-02-03-bissbilanz-food-tracking-design.md`
3. Implementation plans in `docs/plans/`
