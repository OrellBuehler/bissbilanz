import type { User, Session } from '$lib/server/db';

declare global {
	namespace App {
		interface Locals {
			user?: User;
			session?: Session;
		}
	}
}

export {};
