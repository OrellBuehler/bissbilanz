import type { ProviderConfig } from './auth-providers';

export type TokenResponse = {
	access_token: string;
	refresh_token?: string;
	id_token: string;
	token_type: string;
	expires_in: number;
};

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
	provider: ProviderConfig;
	redirectUri: string;
	state: string;
	nonce: string;
	codeChallenge?: string;
}) => {
	const { provider } = input;
	const url = new URL(provider.authorizeEndpoint);
	url.searchParams.set('client_id', provider.clientId);
	url.searchParams.set('redirect_uri', input.redirectUri);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', provider.scopes);
	url.searchParams.set('state', input.state);
	url.searchParams.set('nonce', input.nonce);
	if (provider.responseMode) {
		url.searchParams.set('response_mode', provider.responseMode);
	}
	for (const [key, value] of Object.entries(provider.extraAuthParams ?? {})) {
		url.searchParams.set(key, value);
	}
	if (provider.usesPkce && input.codeChallenge) {
		url.searchParams.set('code_challenge', input.codeChallenge);
		url.searchParams.set('code_challenge_method', 'S256');
	}
	return url.toString();
};

export const exchangeCodeForTokens = async (input: {
	provider: ProviderConfig;
	code: string;
	redirectUri: string;
	codeVerifier?: string;
}): Promise<TokenResponse> => {
	const { provider } = input;
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code: input.code,
		client_id: provider.clientId,
		client_secret: await provider.clientSecret(),
		redirect_uri: input.redirectUri
	});
	if (provider.usesPkce) {
		body.set('code_verifier', input.codeVerifier ?? '');
	}

	const response = await fetch(provider.tokenEndpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
		signal: AbortSignal.timeout(10000)
	});

	if (!response.ok) {
		throw new Error(`Token exchange failed for ${provider.id}: ${response.status}`);
	}

	return response.json() as Promise<TokenResponse>;
};

export const fetchUserInfo = async (
	provider: ProviderConfig,
	accessToken: string
): Promise<Record<string, unknown> | undefined> => {
	if (!provider.userinfoEndpoint) return undefined;

	const response = await fetch(provider.userinfoEndpoint, {
		headers: { Authorization: `Bearer ${accessToken}` },
		signal: AbortSignal.timeout(10000)
	});

	if (!response.ok) {
		throw new Error(`User info request failed for ${provider.id}: ${response.status}`);
	}

	return response.json() as Promise<Record<string, unknown>>;
};
