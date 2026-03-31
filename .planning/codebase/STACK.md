# Technology Stack

**Analysis Date:** 2026-02-17

## Languages

**Primary:**

- TypeScript 5.9.3 - All backend and frontend code
- Svelte 5.48.2 - Frontend framework with runes support

**Secondary:**

- JavaScript - Configuration files (svelte.config.js)
- SQL - Database migrations in `drizzle/` folder

## Runtime

**Environment:**

- Bun 1.3.8+ - JavaScript/TypeScript runtime and package manager (development and production)

**Package Manager:**

- Bun - Specified in package.json with `"type": "module"`
- Lockfile: `bun.lockb` (binary lockfile format)

## Frameworks

**Core:**

- SvelteKit 2.50.1 - Full-stack web framework
- Svelte 5.48.2 - Component framework with runes (`$state`, `$derived`, `$effect`)

**UI Components:**

- shadcn-svelte (bits-ui 2.15.5) - Headless component library
- Tailwind CSS 4.1.18 - Utility-first CSS framework with `@tailwindcss/vite` plugin
- Lucide-svelte 0.561.0 - Icon library
- Embla Carousel Svelte 8.6.0 - Carousel component
- Vaul-svelte 1.0.0-next.7 - Drawer component

**Tables & Data Display:**

- TanStack Table Core 8.21.3 - Headless table component
- Formsnap 2.0.1 - Form validation and submission

**Data Visualization:**

- Layerchart 2.0.0-next.43 - Charts and data visualization

**Forms & Validation:**

- Sveltekit-superforms 2.28.1 - Server/client form handling
- Zod 4.3.6 - Runtime schema validation

**Internationalization:**

- Paraglide JS 2.10.0 - i18n framework (generates code at build time)

**Styling Utilities:**

- Tailwind Merge 3.4.0 - Utility class merging
- Tailwind Variants 3.2.2 - Variant component patterns
- TW Animate CSS 1.4.0 - Animation utilities
- Clsx 2.1.1 - Conditional class names
- Mode Watcher 1.1.0 - Theme mode detection

**PWA:**

- @vite-pwa/sveltekit 1.1.0 - Progressive Web App support with offline caching
- Workbox integration for runtime caching of API endpoints

**Feature-Specific:**

- @zxing/browser + @zxing/library - Barcode scanning (pure TypeScript ZXing port)

## Testing

**Test Runner:**

- Bun test (built-in) - Native test framework
- Config: No separate config file needed; tests run directly

## Build & Development

**Build Tool:**

- Vite 7.3.1 - Module bundler with HMR

**SvelteKit Adapter:**

- svelte-adapter-bun 1.0.1 - Bun production adapter with precompression

**Vite Plugins:**

- @sveltejs/vite-plugin-svelte 6.2.4 - Svelte compilation
- @tailwindcss/vite 4.1.18 - Tailwind CSS compilation
- @vite-pwa/sveltekit 1.1.0 - PWA manifest and service worker generation
- paraglideVitePlugin - i18n compilation (strategy: ['url', 'cookie', 'baseLocale'])

**Type Checking:**

- svelte-check 4.3.5 - Svelte component type validation

**Schema Management:**

- drizzle-kit 0.31.8 - Database migration generation and management
- Supports: `db:generate`, `db:push`, `db:migrate`, `db:studio` commands

## Database

**ORM:**

- Drizzle ORM 0.45.1 - Type-safe database client
- Dialect: PostgreSQL via `drizzle-orm/postgres-js` (postgres.js driver)
- Database connection: postgres.js (porsager/postgres) with connection pooling

**Database:**

- PostgreSQL - Primary database
- Environment variable: `DATABASE_URL=postgres://user:password@host:5432/bissbilanz`

**Pool Configuration:**

- MAX: 10 connections (DATABASE_POOL_MAX)
- Idle Timeout: 30 seconds (DATABASE_IDLE_TIMEOUT_SECONDS)
- Connect Timeout: 10 seconds (DATABASE_CONNECT_TIMEOUT_SECONDS)
- Statement Timeout: 30 seconds (DATABASE_STATEMENT_TIMEOUT_MS)
- Max Lifetime: 300 seconds (DATABASE_MAX_LIFETIME_SECONDS)

## Authentication & Security

**Crypto:**

- bcrypt 6.0.0 - Password hashing (dev dependency: @types/bcrypt 6.0.0)
- jose 6.1.3 - JWT/OIDC token verification and signing

**OIDC/OAuth:**

- Infomaniak OIDC - External identity provider integration
- PKCE (Proof Key for Code Exchange) support in OAuth flow
- JWT token verification with nonce validation

## External APIs

**Model Context Protocol (MCP):**

- @modelcontextprotocol/sdk 1.26.0 - AI model integration (Claude, OpenAI)
- Endpoint: `/api/mcp`
- Tools: get_daily_status, search_foods, create_food, create_recipe, log_food

**Open Food Facts:**

- Free API for barcode-based food data: `https://world.openfoodfacts.net/api/v2/product`
- No authentication required
- Fetches nutrition data, images, additives, NutriScore

## Configuration

**Environment Variables:**

- `INFOMANIAK_CLIENT_ID` - OAuth client ID
- `INFOMANIAK_CLIENT_SECRET` - OAuth client secret
- `INFOMANIAK_REDIRECT_URI` - OAuth callback URL
- `DATABASE_URL` - PostgreSQL connection string
- `DATABASE_POOL_MAX` - Max pool connections (default: 10)
- `DATABASE_IDLE_TIMEOUT_SECONDS` - Idle timeout (default: 30)
- `DATABASE_CONNECT_TIMEOUT_SECONDS` - Connect timeout (default: 10)
- `DATABASE_STATEMENT_TIMEOUT_MS` - Query timeout (default: 30000)
- `DATABASE_MAX_LIFETIME_SECONDS` - Connection lifetime (default: 300)
- `DATABASE_APPLICATION_NAME` - App identifier in logs (default: "bissbilanz")
- `SESSION_SECRET` - Session encryption key (32 bytes base64)
- `PUBLIC_APP_URL` - Application base URL (e.g., http://localhost:4000)
- `MCP_ENDPOINT_ENABLED` - Enable MCP integration (boolean, optional)

**Build Configuration:**

- `tsconfig.json` - TypeScript strict mode, source maps enabled
- `svelte.config.js` - Adapter: svelte-adapter-bun, CSRF: trustedOrigins=['*']
- `vite.config.ts` - Dev server port: 4000
- `drizzle.config.ts` - Schema: src/lib/server/schema.ts, migrations: drizzle/
- `.prettierrc` - Code formatting (Prettier config if present)

**Inlang/Paraglide Configuration:**

- `project.inlang/` - i18n project directory
- Locales: en (English), de (German)
- Compiled output: `src/lib/paraglide/` (gitignored, generated at build time)
- Paraglide runtime config: url, cookie, baseLocale strategies

## Platform Requirements

**Development:**

- Bun 1.3.8 or higher
- PostgreSQL database (local or remote)
- Node.js types: @types/node 25.2.0, @types/bun 1.3.8
- Internationalized Date support: @internationalized/date 3.10.0

**Production:**

- Bun runtime
- PostgreSQL database with SSL
- Environment variables for all configuration (see above)
- HTTPS (Secure cookies require `INFOMANIAK_REDIRECT_URI` to start with https://)

**Browser Support:**

- Modern browsers supporting ES2020+
- PWA: Service Worker support (for offline functionality)
- Mobile: iOS Safari 11.3+, Chrome 40+

---

_Stack analysis: 2026-02-17_
