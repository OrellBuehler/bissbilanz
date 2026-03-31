type DatabaseEnv = Record<string, string | undefined>;

const toNumber = (value: string | undefined, fallback: number) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export const parseDatabaseConfig = (env: DatabaseEnv) => ({
	url: env.DATABASE_URL!,
	poolMax: toNumber(env.DATABASE_POOL_MAX, 5),
	// Close idle connections well before the managed DB provider does (~30s server-side)
	idleTimeoutSeconds: toNumber(env.DATABASE_IDLE_TIMEOUT_SECONDS, 10),
	connectTimeoutSeconds: toNumber(env.DATABASE_CONNECT_TIMEOUT_SECONDS, 10),
	statementTimeoutMs: toNumber(env.DATABASE_STATEMENT_TIMEOUT_MS, 30_000),
	maxLifetimeSeconds: toNumber(env.DATABASE_MAX_LIFETIME_SECONDS, 120),
	applicationName: env.DATABASE_APPLICATION_NAME ?? 'bissbilanz'
});

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
	testUserId: process.env.TEST_USER_ID ?? '00000000-0000-0000-0000-000000000001'
};
