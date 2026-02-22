const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const base64Url = (input: ArrayBuffer | Uint8Array) => {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	let binary = '';
	bytes.forEach((b) => (binary += String.fromCharCode(b)));
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64Url = (input: string) => {
	const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
};

const deriveKey = async (secret: string) => {
	const hash = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret));
	return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

export const encryptToken = async (token: string, secret: string) => {
	const key = await deriveKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		textEncoder.encode(token)
	);
	const combined = new Uint8Array(iv.length + ciphertext.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(ciphertext), iv.length);
	return base64Url(combined);
};

export const decryptToken = async (encrypted: string, secret: string) => {
	const key = await deriveKey(secret);
	const combined = fromBase64Url(encrypted);
	const iv = combined.slice(0, 12);
	const ciphertext = combined.slice(12);
	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
	return textDecoder.decode(plaintext);
};
