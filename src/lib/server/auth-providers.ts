import type { JWTPayload } from 'jose';
import { config } from './env';
import { appleConfig, createAppleClientSecret } from './apple-secret';

export const providerIds = ['infomaniak', 'google', 'apple'] as const;
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
	},
	google: {
		id: 'google',
		issuer: 'https://accounts.google.com',
		authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenEndpoint: 'https://oauth2.googleapis.com/token',
		scopes: 'openid email profile',
		usesPkce: true,
		mapClaims: (claims) => ({
			sub: str(claims.sub) ?? '',
			email: str(claims.email),
			name: str(claims.name),
			avatarUrl: str(claims.picture)
		})
	},
	apple: {
		id: 'apple',
		issuer: 'https://appleid.apple.com',
		authorizeEndpoint: 'https://appleid.apple.com/auth/authorize',
		tokenEndpoint: 'https://appleid.apple.com/auth/token',
		// Requesting name or email obliges Apple to reply with a form POST.
		scopes: 'name email',
		responseMode: 'form_post',
		// Apple authenticates the client with the signed secret JWT instead.
		usesPkce: false,
		mapClaims: (claims) => ({
			sub: str(claims.sub) ?? '',
			email: str(claims.email)
			// Apple has no userinfo endpoint and never sends a picture. The name
			// arrives once, in the callback form body, and is merged in there.
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

type ResolvedCredentials = { clientId: string; clientSecret: () => Promise<string> };

/** Apple has no static secret, so its credentials resolve differently. */
function resolveCredentials(id: ProviderId): ResolvedCredentials | null {
	if (id === 'apple') {
		const apple = appleConfig();
		if (!apple) return null;
		return { clientId: apple.servicesId, clientSecret: createAppleClientSecret };
	}

	const credentials = credentialsFor(id);
	if (!credentials) return null;
	return {
		clientId: credentials.clientId,
		clientSecret: async () => credentials.clientSecret
	};
}

export function getProvider(id: string): ProviderConfig | null {
	if (!isProviderId(id)) return null;
	const credentials = resolveCredentials(id);
	if (!credentials) return null;

	return {
		...providerDefs[id],
		...credentials,
		redirectUri: redirectUriFor(id),
		mobileRedirectUri: mobileRedirectUriFor(id)
	};
}

export function enabledProviderIds(): ProviderId[] {
	return providerIds.filter((id) => resolveCredentials(id) !== null);
}
