import webpush from 'web-push';
import { config } from '$lib/server/env';

export type VapidConfig = {
	publicKey: string;
	privateKey: string;
	subject: string;
};

export const getVapidConfig = (): VapidConfig | null => {
	const { publicKey, privateKey, subject } = config.push;
	if (!publicKey || !privateKey || !subject) return null;
	return { publicKey, privateKey, subject };
};

export const isPushEnabled = () => getVapidConfig() !== null;

let applied = false;

/** Push the VAPID details into the web-push singleton once per process. */
export const ensureVapidConfigured = (): VapidConfig | null => {
	const vapid = getVapidConfig();
	if (!vapid) return null;
	if (!applied) {
		webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
		applied = true;
	}
	return vapid;
};
