import createClient from 'openapi-fetch';
import type { components, paths } from '$lib/api/generated/schema';

export type AdminUserRow = components['schemas']['AdminUserRow'];
export type AdminUserDetail = components['schemas']['AdminUserDetailResponse'];
export type AdminClaudeOverview = components['schemas']['AdminClaudeOverviewResponse'];
export type AdminClaudeAccess = components['schemas']['AdminClaudeAccess'];
export type AdminClaudeAccessUpdate = components['schemas']['AdminClaudeAccessUpdate'];
export type AdminUserSort = NonNullable<
	paths['/api/admin/users']['get']['parameters']['query']
>['sort'];
export type AdminUserAccessFilter = NonNullable<
	paths['/api/admin/users']['get']['parameters']['query']
>['access'];

export type AdminUserListParams = {
	q: string;
	access: NonNullable<AdminUserAccessFilter>;
	sort: NonNullable<AdminUserSort>;
	order: 'asc' | 'desc';
	limit: number;
	offset: number;
};

export class AdminRequestError extends Error {
	status: number;

	constructor(status: number, message?: string) {
		super(message ?? `Admin request failed with status ${status}`);
		this.name = 'AdminRequestError';
		this.status = status;
	}
}

// Plain fetch on purpose: the shared apiFetch queues failed writes for replay when
// offline, which would silently defer an access change the admin expects to see now.
const client = createClient<paths>({
	baseUrl: '',
	fetch: (input) => fetch(input)
});

function failure(response: Response, error: unknown): never {
	const message =
		typeof error === 'object' && error !== null && 'error' in error
			? String((error as { error: unknown }).error)
			: undefined;
	throw new AdminRequestError(response.status, message);
}

export async function fetchUsers(params: AdminUserListParams) {
	const { data, error, response } = await client.GET('/api/admin/users', {
		params: { query: { ...params, q: params.q.trim() || undefined } }
	});
	if (!data) failure(response, error);
	return data;
}

export async function fetchUserDetail(id: string, days: number): Promise<AdminUserDetail> {
	const { data, error, response } = await client.GET('/api/admin/users/{id}', {
		params: { path: { id }, query: { days } }
	});
	if (!data) failure(response, error);
	return data;
}

export async function patchClaudeAccess(
	id: string,
	body: AdminClaudeAccessUpdate
): Promise<AdminClaudeAccess> {
	const { data, error, response } = await client.PATCH('/api/admin/users/{id}/claude-access', {
		params: { path: { id } },
		body
	});
	if (!data) failure(response, error);
	return data.access;
}

export async function fetchClaudeOverview(): Promise<AdminClaudeOverview> {
	const { data, error, response } = await client.GET('/api/admin/claude');
	if (!data) failure(response, error);
	return data;
}

export async function patchKillSwitch(enabled: boolean): Promise<boolean> {
	const { data, error, response } = await client.PATCH('/api/admin/claude', {
		body: { enabled }
	});
	if (!data) failure(response, error);
	return data.enabled;
}

/**
 * Applies a UI change immediately and puts it back if the request fails, so the
 * screen never keeps showing a state the server rejected.
 */
export async function runOptimistic<T>({
	apply,
	rollback,
	request
}: {
	apply: () => void;
	rollback: () => void;
	request: () => Promise<T>;
}): Promise<T> {
	apply();
	try {
		return await request();
	} catch (error) {
		rollback();
		throw error;
	}
}

export function isUnexpectedFailure(error: unknown): boolean {
	return !(error instanceof AdminRequestError) || error.status >= 500;
}
