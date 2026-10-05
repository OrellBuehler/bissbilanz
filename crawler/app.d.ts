// Minimal stand-in for src/app.d.ts so tests can import the app's package reader.
declare global {
	namespace App {
		interface Locals {
			user?: { id: string };
			tokenScopes?: string[];
		}
	}
}

export {};
