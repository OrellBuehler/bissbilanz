import type { ZodError } from 'zod';

export interface UserProfile {
	id: string;
	email: string | null;
	name: string | null;
	avatarUrl: string | null;
}

export type SuccessResult<T> = { success: true; data: T };
export type ErrorResult = { success: false; error: ZodError | Error };
export type Result<T> = SuccessResult<T> | ErrorResult;

export type DeleteResult = { blocked: true; entryCount: number } | { blocked: false };
