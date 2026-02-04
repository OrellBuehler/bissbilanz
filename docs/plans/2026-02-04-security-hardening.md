# Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the auth/session and HTTP surface with OIDC state/nonce/PKCE, ID token verification, CSRF/origin checks, security headers, rate limiting, and safer token handling.

**Architecture:** Add a small security utility layer in `src/lib/server` for OIDC helpers, header generation, and rate limiting, then wire these into the auth routes and global hook. Keep all behavior server-side and unit-tested with bun.

**Tech Stack:** SvelteKit 2.x, Svelte 5, Bun, Drizzle ORM, PostgreSQL, `jose`

---

### Task 1: OIDC Helper Utilities (State/Nonce/PKCE)

**Files:**
- Create: `src/lib/server/oidc.ts`
- Create: `tests/server/oidc.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { buildAuthorizeUrl, createCodeChallenge, generateNonce, generateState } from '../../src/lib/server/oidc';

const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('oidc helpers', () => {
	test('generateState and generateNonce return non-empty values', () => {
		expect(generateState().length).toBeGreaterThan(10);
		expect(generateNonce().length).toBeGreaterThan(10);
	});

	test('createCodeChallenge matches RFC example', async () => {
		const challenge = await createCodeChallenge(RFC_VERIFIER);
		expect(challenge).toBe(RFC_CHALLENGE);
	});

	test('buildAuthorizeUrl includes state and nonce', () => {
		const url = buildAuthorizeUrl({
			clientId: 'client',
			redirectUri: 'https://app.local/callback',
			state: 'state123',
			nonce: 'nonce123',
			codeChallenge: 'challenge'
		});
		expect(url).toContain('state=state123');
		expect(url).toContain('nonce=nonce123');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/oidc.test.ts`
Expected: FAIL with “Cannot find module …/oidc”

**Step 3: Write minimal implementation**

Create `src/lib/server/oidc.ts`:
```ts
const textEncoder = new TextEncoder();

const base64Url = (input: ArrayBuffer | Uint8Array) => {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	let binary = '';
	bytes.forEach((b) => (binary += String.fromCharCode(b)));
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const generateState = () => crypto.randomUUID();
export const generateNonce = () => crypto.randomUUID();

export const generateCodeVerifier = () => {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return base64Url(bytes);
};

export const createCodeChallenge = async (verifier: string) => {
	const hash = await crypto.subtle.digest('SHA-256', textEncoder.encode(verifier));
	return base64Url(hash);
};

export const buildAuthorizeUrl = (input: {
	clientId: string;
	redirectUri: string;
	state: string;
	nonce: string;
	codeChallenge?: string;
}) => {
	const url = new URL('https://login.infomaniak.com/authorize');
	url.searchParams.set('client_id', input.clientId);
	url.searchParams.set('redirect_uri', input.redirectUri);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', 'openid email profile');
	url.searchParams.set('state', input.state);
	url.searchParams.set('nonce', input.nonce);
	if (input.codeChallenge) {
		url.searchParams.set('code_challenge', input.codeChallenge);
		url.searchParams.set('code_challenge_method', 'S256');
	}
	return url.toString();
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/oidc.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/oidc.ts tests/server/oidc.test.ts
git commit -m "feat: add OIDC helper utilities"
```

---

### Task 2: Login Route with State/Nonce/PKCE Cookies

**Files:**
- Modify: `src/routes/api/auth/login/+server.ts`
- Create: `tests/server/oidc-cookies.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { oidcCookieOptions } from '../../src/lib/server/oidc-cookies';

describe('oidcCookieOptions', () => {
	test('uses HttpOnly and SameSite=Lax', () => {
		const opts = oidcCookieOptions(true);
		expect(opts.httpOnly).toBe(true);
		expect(opts.sameSite).toBe('lax');
		expect(opts.secure).toBe(true);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/oidc-cookies.test.ts`
Expected: FAIL with “Cannot find module …/oidc-cookies”

**Step 3: Write minimal implementation**

Create `src/lib/server/oidc-cookies.ts`:
```ts
export const oidcCookieOptions = (secure: boolean) => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure,
	maxAge: 10 * 60
});
```

Update `src/routes/api/auth/login/+server.ts`:
```ts
import { redirect } from '@sveltejs/kit';
import { config } from '$lib/server/env';
import { buildAuthorizeUrl, createCodeChallenge, generateCodeVerifier, generateNonce, generateState } from '$lib/server/oidc';
import { oidcCookieOptions } from '$lib/server/oidc-cookies';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const state = generateState();
	const nonce = generateNonce();
	const verifier = generateCodeVerifier();
	const challenge = await createCodeChallenge(verifier);
	const secure = url.protocol === 'https:';

	cookies.set('oidc_state', state, oidcCookieOptions(secure));
	cookies.set('oidc_nonce', nonce, oidcCookieOptions(secure));
	cookies.set('oidc_verifier', verifier, oidcCookieOptions(secure));

	const authUrl = buildAuthorizeUrl({
		clientId: config.infomaniak.clientId,
		redirectUri: config.infomaniak.redirectUri,
		state,
		nonce,
		codeChallenge: challenge
	});

	throw redirect(302, authUrl);
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/oidc-cookies.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/oidc-cookies.ts src/routes/api/auth/login/+server.ts tests/server/oidc-cookies.test.ts
git commit -m "feat: add OIDC state/nonce cookies"
```

---

### Task 3: Callback Validation + ID Token Claim Checks

**Files:**
- Modify: `src/routes/api/auth/callback/+server.ts`
- Create: `src/lib/server/oidc-validate.ts`
- Create: `tests/server/oidc-validate.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { assertState, assertNonce } from '../../src/lib/server/oidc-validate';

describe('oidc validate', () => {
	test('assertState throws on mismatch', () => {
		expect(() => assertState('expected', 'actual')).toThrow();
	});

	test('assertNonce throws on mismatch', () => {
		expect(() => assertNonce('expected', 'actual')).toThrow();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/oidc-validate.test.ts`
Expected: FAIL with “Cannot find module …/oidc-validate”

**Step 3: Write minimal implementation**

Create `src/lib/server/oidc-validate.ts`:
```ts
export const assertState = (expected: string | undefined, actual: string | null) => {
	if (!expected || expected !== actual) {
		throw new Error('Invalid OIDC state');
	}
};

export const assertNonce = (expected: string | undefined, actual: string | undefined) => {
	if (!expected || expected !== actual) {
		throw new Error('Invalid OIDC nonce');
	}
};
```

Update `src/routes/api/auth/callback/+server.ts`:
```ts
import { assertNonce, assertState } from '$lib/server/oidc-validate';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const expectedState = cookies.get('oidc_state');
	const expectedNonce = cookies.get('oidc_nonce');
	const codeVerifier = cookies.get('oidc_verifier');

	assertState(expectedState, state);

	// token request includes code_verifier
	body: new URLSearchParams({
		grant_type: 'authorization_code',
		code,
		client_id: config.infomaniak.clientId,
		client_secret: config.infomaniak.clientSecret,
		redirect_uri: config.infomaniak.redirectUri,
		code_verifier: codeVerifier ?? ''
	})

	// after fetching tokens, validate nonce
	const idToken = tokens.id_token;
	const decoded = decodeIdToken(idToken);
	assertNonce(expectedNonce, decoded.nonce);

	cookies.delete('oidc_state', { path: '/' });
	cookies.delete('oidc_nonce', { path: '/' });
	cookies.delete('oidc_verifier', { path: '/' });

	// continue userinfo flow
};
```

Add a lightweight `decodeIdToken` helper inside `oidc-validate.ts`:
```ts
export const decodeIdToken = (idToken: string): { nonce?: string } => {
	const payload = idToken.split('.')[1];
	const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
	return JSON.parse(json);
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/oidc-validate.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/oidc-validate.ts src/routes/api/auth/callback/+server.ts tests/server/oidc-validate.test.ts
git commit -m "feat: validate OIDC state and nonce"
```

---

### Task 4: ID Token Signature Verification (JOSE)

**Files:**
- Modify: `package.json`
- Create: `src/lib/server/oidc-jwt.ts`
- Create: `tests/server/oidc-jwt.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { assertClaims } from '../../src/lib/server/oidc-jwt';

describe('assertClaims', () => {
	test('throws when issuer mismatches', () => {
		expect(() => assertClaims({ iss: 'bad', aud: 'client', nonce: 'n' }, {
			issuer: 'good',
			audience: 'client',
			nonce: 'n'
		})).toThrow();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/oidc-jwt.test.ts`
Expected: FAIL with “Cannot find module …/oidc-jwt”

**Step 3: Write minimal implementation**

Run:
```bash
bun add jose
```

Create `src/lib/server/oidc-jwt.ts`:
```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const assertClaims = (
	payload: { iss?: string; aud?: string | string[]; nonce?: string },
	expected: { issuer: string; audience: string; nonce: string }
) => {
	if (payload.iss !== expected.issuer) throw new Error('Invalid issuer');
	const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
	if (!aud.includes(expected.audience)) throw new Error('Invalid audience');
	if (payload.nonce !== expected.nonce) throw new Error('Invalid nonce');
};

export const verifyIdToken = async (idToken: string, expected: { issuer: string; audience: string; nonce: string }) => {
	const discovery = await fetch(`${expected.issuer}/.well-known/openid-configuration`).then((r) => r.json());
	const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
	const { payload } = await jwtVerify(idToken, jwks, { issuer: expected.issuer, audience: expected.audience });
	assertClaims(payload, expected);
	return payload;
};
```

Update `src/routes/api/auth/callback/+server.ts` to replace `decodeIdToken` usage with `verifyIdToken`.

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/oidc-jwt.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json bun.lock src/lib/server/oidc-jwt.ts src/routes/api/auth/callback/+server.ts tests/server/oidc-jwt.test.ts
git commit -m "feat: verify ID token with JOSE"
```

---

### Task 5: Cookie Handling + CSRF/Origin Check

**Files:**
- Create: `src/lib/server/security.ts`
- Modify: `src/hooks.server.ts`
- Modify: `src/routes/api/auth/me/+server.ts`
- Modify: `src/routes/api/auth/logout/+server.ts`
- Create: `tests/server/security.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { assertSameOrigin } from '../../src/lib/server/security';

describe('assertSameOrigin', () => {
	test('throws when origin mismatches', () => {
		expect(() => assertSameOrigin('https://evil.com', 'https://app.local')).toThrow();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/security.test.ts`
Expected: FAIL with “Cannot find module …/security”

**Step 3: Write minimal implementation**

Create `src/lib/server/security.ts`:
```ts
export const assertSameOrigin = (origin: string | null, expected: string) => {
	if (!origin) throw new Error('Missing origin');
	if (origin !== expected) throw new Error('Invalid origin');
};
```

Update `src/hooks.server.ts` to use `event.cookies.get('session')` instead of manual parsing.

Update `src/routes/api/auth/me/+server.ts` and `src/routes/api/auth/logout/+server.ts` to use `cookies.get('session')`.

Update `src/routes/api/auth/logout/+server.ts`:
```ts
import { assertSameOrigin } from '$lib/server/security';
import { config } from '$lib/server/env';

const origin = request.headers.get('origin');
assertSameOrigin(origin, config.app.url);
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/security.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/security.ts src/hooks.server.ts src/routes/api/auth/me/+server.ts src/routes/api/auth/logout/+server.ts tests/server/security.test.ts
git commit -m "feat: add origin check and cookie access"
```

---

### Task 6: Security Headers

**Files:**
- Modify: `src/lib/server/security.ts`
- Modify: `src/hooks.server.ts`
- Create: `tests/server/security-headers.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { securityHeaders } from '../../src/lib/server/security';

describe('securityHeaders', () => {
	test('includes CSP and HSTS', () => {
		const headers = securityHeaders();
		expect(headers['content-security-policy']).toBeTruthy();
		expect(headers['strict-transport-security']).toBeTruthy();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/security-headers.test.ts`
Expected: FAIL with “securityHeaders is not exported”

**Step 3: Write minimal implementation**

Update `src/lib/server/security.ts`:
```ts
export const securityHeaders = () => ({
	'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
	'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=()'
});
```

Update `src/hooks.server.ts` to apply these headers to the response:
```ts
const response = await resolve(event);
for (const [key, value] of Object.entries(securityHeaders())) {
	response.headers.set(key, value);
}
return response;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/security-headers.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/security.ts src/hooks.server.ts tests/server/security-headers.test.ts
git commit -m "feat: add security headers"
```

---

### Task 7: Rate Limiting for Auth Endpoints

**Files:**
- Create: `src/lib/server/rate-limit.ts`
- Modify: `src/routes/api/auth/login/+server.ts`
- Modify: `src/routes/api/auth/callback/+server.ts`
- Modify: `src/routes/api/auth/logout/+server.ts`
- Create: `tests/server/rate-limit.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { rateLimit } from '../../src/lib/server/rate-limit';

describe('rateLimit', () => {
	test('blocks after max attempts', () => {
		const key = 'ip:1';
		for (let i = 0; i < 5; i++) rateLimit(key, 5, 60_000);
		expect(() => rateLimit(key, 5, 60_000)).toThrow();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/rate-limit.test.ts`
Expected: FAIL with “Cannot find module …/rate-limit”

**Step 3: Write minimal implementation**

Create `src/lib/server/rate-limit.ts`:
```ts
const buckets = new Map<string, { count: number; resetAt: number }>();

export const rateLimit = (key: string, max: number, windowMs: number) => {
	const now = Date.now();
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt < now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return;
	}
	if (bucket.count >= max) throw new Error('Rate limit exceeded');
	bucket.count += 1;
};
```

Update auth routes to call `rateLimit` using `event.getClientAddress()` and return 429 on error.

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/rate-limit.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/rate-limit.ts src/routes/api/auth/login/+server.ts src/routes/api/auth/callback/+server.ts src/routes/api/auth/logout/+server.ts tests/server/rate-limit.test.ts
git commit -m "feat: add auth rate limiting"
```

---

### Task 8: Refresh Token Handling Decision (Optional)

**Files:**
- Modify: `src/lib/server/schema.ts`
- Modify: `src/lib/server/session.ts`
- Create: `drizzle/XXXX_drop_refresh_token.sql`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { hasRefreshToken } from '../../src/lib/server/session';

describe('hasRefreshToken', () => {
	test('returns false when unused', () => {
		expect(hasRefreshToken(null)).toBe(false);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/session.test.ts`
Expected: FAIL with “Cannot find module …/session.test.ts”

**Step 3: Write minimal implementation**

Option A (remove refresh tokens):
- Drop `refresh_token` column via migration.
- Remove `refreshToken` field from `sessions` inserts.
- Add `hasRefreshToken` utility to return false always.

Option B (encrypt refresh tokens):
- Add `encryptToken` and `decryptToken` utilities using `SESSION_SECRET`.
- Store encrypted values in DB.

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/session.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/schema.ts src/lib/server/session.ts drizzle/XXXX_drop_refresh_token.sql tests/server/session.test.ts
git commit -m "feat: adjust refresh token storage"
```
