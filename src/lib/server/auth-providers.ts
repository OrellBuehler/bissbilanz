import type { JWTPayload } from 'jose';
import { config } from './env';

export const providerIds = ['infomaniak'] as const;
export type ProviderId = (typeof providerIds)[number];

export type ProviderProfile = {
	sub: string;
	email?: string;
	name?: string;
	avatarUrl?: string;
};

type Claims = JWTPayload & Record<string, unknown>;
type UserInfo = Record<string, unknown>;

/** Static, credential-free description of a provider. */
export type ProviderDef = {
	id: ProviderId;
	issuer: string;
	authorizeEndpoint: string;
	tokenEndpoint: string;
	/** Omitted when the id_token carries every claim we need. */
	userinfoEndpoint?: string;
	scopes: string;
	usesPkce: boolean;
	responseMode?: 'form_post';
	extraAuthParams?: Record<string, string>;
	mapClaims: (claims: Claims, userinfo?: UserInfo) => ProviderProfile;
};

/** A provider plus the credentials and redirect URIs resolved from the environment. */
export type ProviderConfig = ProviderDef & {
	clientId: string;
	clientSecret: () => Promise<string>;
	redirectUri: string;
	mobileRedirectUri: string;
};

const str = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

export const providerDefs: Record<ProviderId, ProviderDef> = {
	infomaniak: {
		id: 'infomaniak',
		issuer: 'https://login.infomaniak.com',
		authorizeEndpoint: 'https://login.infomaniak.com/authorize',
		tokenEndpoint: 'https://login.infomaniak.com/token',
		userinfoEndpoint: 'https://login.infomaniak.com/oauth2/userinfo',
		scopes: 'openid email profile',
		usesPkce: true,
		mapClaims: (claims, userinfo) => ({
			sub: str(userinfo?.sub) ?? str(claims.sub) ?? '',
			email: str(userinfo?.email),
			name: str(userinfo?.name),
			avatarUrl: str(userinfo?.picture)
		})
	}
};

export function isProviderId(value: string): value is ProviderId {
	return (providerIds as readonly string[]).includes(value);
}

type Credentials = { clientId: string; clientSecret: string };
type CredentialSource = { clientId?: string; clientSecret?: string } | undefined;

/** Returns null when the provider is not configured, which is how it stays disabled. */
export function credentialsFor(id: ProviderId, source?: CredentialSource): Credentials | null {
	const raw =
		source ?? (config as unknown as Record<ProviderId, CredentialSource>)[id] ?? undefined;
	const clientId = raw?.clientId?.trim();
	const clientSecret = raw?.clientSecret?.trim();
	if (!clientId || !clientSecret) return null;
	return { clientId, clientSecret };
}

function redirectUriFor(id: ProviderId): string {
	// Infomaniak's redirect URI predates the per-provider callback paths and is
	// already registered in their console, so it keeps its own env var.
	if (id === 'infomaniak') return config.infomaniak.redirectUri;
	return `${config.app.url}/api/auth/callback/${id}`;
}

function mobileRedirectUriFor(id: ProviderId): string {
	if (id === 'infomaniak') return `${config.app.url}/api/auth/mobile/callback`;
	return `${config.app.url}/api/auth/mobile/callback/${id}`;
}

export function getProvider(id: string): ProviderConfig | null {
	if (!isProviderId(id)) return null;
	const credentials = credentialsFor(id);
	if (!credentials) return null;

	return {
		...providerDefs[id],
		clientId: credentials.clientId,
		clientSecret: async () => credentials.clientSecret,
		redirectUri: redirectUriFor(id),
		mobileRedirectUri: mobileRedirectUriFor(id)
	};
}

export function enabledProviderIds(): ProviderId[] {
	return providerIds.filter((id) => credentialsFor(id) !== null);
}
