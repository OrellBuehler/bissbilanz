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

export const decodeIdToken = (idToken: string): { nonce?: string } => {
	const payload = idToken.split('.')[1];
	const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
	return JSON.parse(json);
};
