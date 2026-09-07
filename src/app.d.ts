import type { User, Session } from '$lib/server/db';

declare global {
	/** Versioned URL prefix of the self-hosted Tesseract assets (set by Vite). */
	const __OCR_ASSET_BASE__: string;

	namespace App {
		interface Locals {
			user?: User;
			session?: Session;
		}
	}
}

export {};
