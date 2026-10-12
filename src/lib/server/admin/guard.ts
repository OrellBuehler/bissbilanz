import { ApiError } from '$lib/server/errors';

export function isAdminSession(locals: App.Locals): boolean {
	return !!locals.user?.isAdmin && !!locals.session && !locals.tokenScopes;
}

export function requireAdmin(locals: App.Locals): string {
	if (!isAdminSession(locals) || !locals.user) {
		throw new ApiError(404, 'Not found');
	}
	return locals.user.id;
}
