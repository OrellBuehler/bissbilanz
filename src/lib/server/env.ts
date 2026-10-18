type DatabaseEnv = Record<string, string | undefined>;

const toNumber = (value: string | undefined, fallback: number) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export const parseDatabaseConfig = (env: DatabaseEnv) => ({
	url: env.DATABASE_URL!,
	poolMax: toNumber(env.DATABASE_POOL_MAX, 5),
	idleTimeoutSeconds: toNumber(env.DATABASE_IDLE_TIMEOUT_SECONDS, 20),
	connectTimeoutSeconds: toNumber(env.DATABASE_CONNECT_TIMEOUT_SECONDS, 10),
	statementTimeoutMs: toNumber(env.DATABASE_STATEMENT_TIMEOUT_MS, 30_000),
	maxLifetimeSeconds: toNumber(env.DATABASE_MAX_LIFETIME_SECONDS, 300),
	applicationName: env.DATABASE_APPLICATION_NAME ?? 'bissbilanz'
});

const REQUIRED_VARS = [
	'DATABASE_URL',
	'INFOMANIAK_CLIENT_ID',
	'INFOMANIAK_CLIENT_SECRET',
	'INFOMANIAK_REDIRECT_URI',
	'SESSION_SECRET',
	'PUBLIC_APP_URL'
] as const;

const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-5-5';
const CLAUDE_DEFAULT_GLOBAL_BUDGET_USD = 90;
const CLAUDE_DEFAULT_USER_BUDGET_USD = 10;
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];
const CLAUDE_DEFAULT_EFFORT: ClaudeEffort = 'medium';
const CLAUDE_DEFAULT_MAX_ITERATIONS = 20;
const CLAUDE_MAX_ITERATIONS_LIMIT = 50;

const isClaudeEffort = (value: string): value is ClaudeEffort =>
	(CLAUDE_EFFORTS as readonly string[]).includes(value);

const parseClaudeEffort = (value: string | undefined): ClaudeEffort => {
	const trimmed = value?.trim();
	return trimmed && isClaudeEffort(trimmed) ? trimmed : CLAUDE_DEFAULT_EFFORT;
};

// Unset or blank falls back to the default; anything else must be a finite number >= 0.
const parseClaudeBudget = (value: string | undefined, fallback: number): number | null => {
	if (!value) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function validateEnv(env: Record<string, string | undefined> = process.env): string[] {
	const problems: string[] = [];
	for (const key of REQUIRED_VARS) {
		if (!env[key]?.trim()) problems.push(`${key} is required`);
	}
	if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) {
		problems.push('SESSION_SECRET must be at least 32 characters');
	}
	if (env.DATABASE_URL && !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
		problems.push('DATABASE_URL must be a postgres:// connection string');
	}
	// Optional providers are all-or-nothing: half-configured means a broken button.
	for (const provider of ['GOOGLE']) {
		const id = env[`${provider}_CLIENT_ID`]?.trim();
		const secret = env[`${provider}_CLIENT_SECRET`]?.trim();
		if (Boolean(id) !== Boolean(secret)) {
			problems.push(
				`${provider}_CLIENT_ID and ${provider}_CLIENT_SECRET must be set together (or both left unset)`
			);
		}
	}
	// Web Push is all-or-nothing too: half-configured means a toggle that fails.
	const vapidVars = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
	const vapidSet = vapidVars.filter((key) => env[key]?.trim());
	if (vapidSet.length > 0 && vapidSet.length < vapidVars.length) {
		problems.push(`${vapidVars.join(', ')} must be set together (or all left unset)`);
	}
	if (env.VAPID_SUBJECT?.trim() && !/^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT.trim())) {
		problems.push('VAPID_SUBJECT must be a mailto: or https:// URL');
	}
	const appleVars = ['APPLE_SERVICES_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'];
	const appleSet = appleVars.filter((key) => env[key]?.trim());
	if (appleSet.length > 0 && appleSet.length < appleVars.length) {
		problems.push(`${appleVars.join(', ')} must be set together (or all left unset)`);
	}
	const claudeModel = env.CLAUDE_MODEL?.trim();
	if (claudeModel && !/^claude-[a-z0-9-]+$/.test(claudeModel)) {
		problems.push('CLAUDE_MODEL must look like claude-<name>');
	}
	const globalBudgetRaw = env.CLAUDE_GLOBAL_MONTHLY_BUDGET_USD?.trim();
	const globalBudget = parseClaudeBudget(globalBudgetRaw, CLAUDE_DEFAULT_GLOBAL_BUDGET_USD);
	if (globalBudget === null || globalBudget > 10_000) {
		problems.push('CLAUDE_GLOBAL_MONTHLY_BUDGET_USD must be a number between 0 and 10000');
	}
	const userBudget = parseClaudeBudget(
		env.CLAUDE_DEFAULT_USER_BUDGET_USD?.trim(),
		CLAUDE_DEFAULT_USER_BUDGET_USD
	);
	if (userBudget === null || (globalBudget !== null && userBudget > globalBudget)) {
		problems.push(
			'CLAUDE_DEFAULT_USER_BUDGET_USD must be a number between 0 and CLAUDE_GLOBAL_MONTHLY_BUDGET_USD'
		);
	}
	const claudeEffort = env.CLAUDE_EFFORT?.trim();
	if (claudeEffort && !isClaudeEffort(claudeEffort)) {
		problems.push(`CLAUDE_EFFORT must be one of ${CLAUDE_EFFORTS.join(', ')}`);
	}
	const maxIterations = env.CLAUDE_MAX_ITERATIONS?.trim();
	if (
		maxIterations &&
		!(
			/^\d+$/.test(maxIterations) &&
			Number(maxIterations) >= 1 &&
			Number(maxIterations) <= CLAUDE_MAX_ITERATIONS_LIMIT
		)
	) {
		problems.push(
			`CLAUDE_MAX_ITERATIONS must be a whole number between 1 and ${CLAUDE_MAX_ITERATIONS_LIMIT}`
		);
	}
	if (env.TEST_MODE === 'true') {
		if (env.NODE_ENV === 'production') problems.push('TEST_MODE must not be enabled in production');
		if (!env.TEST_AUTH_TOKEN?.trim())
			problems.push('TEST_AUTH_TOKEN is required when TEST_MODE is enabled');
	}
	return problems;
}

export const config = {
	database: parseDatabaseConfig(process.env),
	infomaniak: {
		clientId: process.env.INFOMANIAK_CLIENT_ID!,
		clientSecret: process.env.INFOMANIAK_CLIENT_SECRET!,
		redirectUri: process.env.INFOMANIAK_REDIRECT_URI!
	},
	// Optional providers: leaving the credentials unset keeps the provider hidden.
	google: {
		clientId: process.env.GOOGLE_CLIENT_ID,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET
	},
	apple: {
		servicesId: process.env.APPLE_SERVICES_ID,
		teamId: process.env.APPLE_TEAM_ID,
		keyId: process.env.APPLE_KEY_ID,
		privateKey: process.env.APPLE_PRIVATE_KEY,
		// Native Sign in with Apple on iOS issues tokens for the app's bundle id.
		bundleId: process.env.APPLE_BUNDLE_ID
	},
	session: {
		secret: process.env.SESSION_SECRET!
	},
	app: {
		url: process.env.PUBLIC_APP_URL!,
		// Whether auth cookies get the Secure attribute. Derived from the public app
		// URL so it stays correct behind a TLS-terminating proxy.
		secureCookies: (process.env.PUBLIC_APP_URL ?? '').startsWith('https'),
		// Set at build time from the release tag (Dockerfile ARG APP_VERSION), so
		// GET /api/health can report which release is actually running.
		version: process.env.APP_VERSION ?? 'dev'
	},
	mcp: {
		enabled: process.env.MCP_ENDPOINT_ENABLED === 'true'
	},
	// Web Push (optional): unset keys keep the Notifications settings section
	// hidden and the reminder dispatcher asleep.
	push: {
		publicKey: process.env.VAPID_PUBLIC_KEY?.trim(),
		privateKey: process.env.VAPID_PRIVATE_KEY?.trim(),
		subject: process.env.VAPID_SUBJECT?.trim()
	},
	// Claude (optional): no API key keeps the feature off everywhere. Budgets are
	// validated at startup by validateEnv, so the fallbacks only cover unset vars.
	claude: {
		apiKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
		model: process.env.CLAUDE_MODEL?.trim() || CLAUDE_DEFAULT_MODEL,
		effort: parseClaudeEffort(process.env.CLAUDE_EFFORT),
		maxIterations: toNumber(
			process.env.CLAUDE_MAX_ITERATIONS?.trim() || undefined,
			CLAUDE_DEFAULT_MAX_ITERATIONS
		),
		globalMonthlyBudgetUsd: toNumber(
			process.env.CLAUDE_GLOBAL_MONTHLY_BUDGET_USD?.trim() || undefined,
			CLAUDE_DEFAULT_GLOBAL_BUDGET_USD
		),
		defaultUserBudgetUsd: toNumber(
			process.env.CLAUDE_DEFAULT_USER_BUDGET_USD?.trim() || undefined,
			CLAUDE_DEFAULT_USER_BUDGET_USD
		),
		configured: !!process.env.ANTHROPIC_API_KEY?.trim()
	},
	testMode: process.env.TEST_MODE === 'true',
	testAuthToken: process.env.TEST_AUTH_TOKEN,
	testUserId: process.env.TEST_USER_ID ?? '00000000-0000-0000-0000-000000000001'
};
