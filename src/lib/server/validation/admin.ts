import 'zod-openapi';
import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
	value === undefined || value === null || value === '' ? undefined : value;

export const adminUserSortValues = [
	'createdAt',
	'lastActiveAt',
	'name',
	'email',
	'monthSpendUsd',
	'entryCount'
] as const;
export type AdminUserSort = (typeof adminUserSortValues)[number];

export const adminUserAccessFilterValues = ['all', 'enabled', 'disabled'] as const;

export const adminUserListQuerySchema = z
	.object({
		q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
		access: z.preprocess(emptyToUndefined, z.enum(adminUserAccessFilterValues).default('all')),
		sort: z.preprocess(emptyToUndefined, z.enum(adminUserSortValues).default('createdAt')),
		order: z.preprocess(emptyToUndefined, z.enum(['asc', 'desc']).default('desc')),
		limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(25)),
		offset: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(0))
	})
	.meta({ id: 'AdminUserListQuery' });

export const adminUserDetailQuerySchema = z
	.object({
		days: z.preprocess(emptyToUndefined, z.coerce.number().int().min(7).max(90).default(30))
	})
	.meta({ id: 'AdminUserDetailQuery' });

export const adminClaudeAccessUpdateSchema = z
	.object({
		enabled: z.boolean().optional(),
		monthlyBudgetUsd: z.number().min(0).max(1000).multipleOf(0.01).nullable().optional(),
		note: z.string().max(500).nullable().optional()
	})
	.refine(
		(value) =>
			value.enabled !== undefined ||
			value.monthlyBudgetUsd !== undefined ||
			value.note !== undefined,
		{ message: 'At least one field is required' }
	)
	.meta({ id: 'AdminClaudeAccessUpdate' });

export const adminClaudeSettingsUpdateSchema = z
	.object({
		enabled: z.boolean()
	})
	.meta({ id: 'AdminClaudeSettingsUpdate' });
