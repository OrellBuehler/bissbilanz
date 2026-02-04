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
