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
	session: {
		secret: process.env.SESSION_SECRET!
	},
	app: {
		url: process.env.PUBLIC_APP_URL!
	},
	mcp: {
		enabled: process.env.MCP_ENDPOINT_ENABLED === 'true'
	},
	testMode: process.env.TEST_MODE === 'true',
	testAuthToken: process.env.TEST_AUTH_TOKEN,
	testUserId: process.env.TEST_USER_ID ?? '00000000-0000-0000-0000-000000000001'
};
