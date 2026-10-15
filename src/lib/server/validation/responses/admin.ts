import 'zod-openapi';
import { z } from 'zod';

const auditPayloadSchema = z.record(z.string(), z.unknown()).nullable();

const adminUserClaudeSchema = z
	.object({
		enabled: z.boolean(),
		monthlyBudgetUsd: z.number().nullable(),
		effectiveBudgetUsd: z.number(),
		monthSpendUsd: z.number(),
		monthCalls: z.number().int(),
		note: z.string().nullable()
	})
	.meta({ id: 'AdminUserClaude' });

export const adminUserRowSchema = z
	.object({
		id: z.string().uuid(),
		name: z.string().nullable(),
		email: z.string().nullable(),
		avatarUrl: z.string().nullable(),
		isAdmin: z.boolean(),
		providers: z.array(z.string()),
		createdAt: z.string().nullable(),
		lastActiveAt: z.string().nullable(),
		entryCount: z.number().int(),
		openAiTaskCount: z.number().int(),
		claude: adminUserClaudeSchema
	})
	.meta({ id: 'AdminUserRow' });

export const adminUsersResponseSchema = z
	.object({
		users: z.array(adminUserRowSchema),
		total: z.number().int()
	})
	.meta({ id: 'AdminUsersResponse' });

const adminDailyUsageSchema = z
	.object({
		date: z.string(),
		costUsd: z.number(),
		calls: z.number().int()
	})
	.meta({ id: 'AdminDailyUsage' });

const adminRecentCallSchema = z
	.object({
		id: z.string().uuid(),
		createdAt: z.string(),
		feature: z.string(),
		model: z.string(),
		status: z.string(),
		inputTokens: z.number().int(),
		outputTokens: z.number().int(),
		cacheReadInputTokens: z.number().int(),
		cacheCreationInputTokens: z.number().int(),
		costUsd: z.number(),
		errorCode: z.string().nullable(),
		aiTaskId: z.string().uuid().nullable(),
		aiTaskStatus: z.string().nullable()
	})
	.meta({ id: 'AdminRecentCall' });

const adminAuditEntrySchema = z
	.object({
		id: z.string().uuid(),
		createdAt: z.string(),
		action: z.string(),
		actorLabel: z.string(),
		before: auditPayloadSchema,
		after: auditPayloadSchema
	})
	.meta({ id: 'AdminAuditEntry' });

export const adminUserDetailResponseSchema = z
	.object({
		user: adminUserRowSchema,
		dailyUsage: z.array(adminDailyUsageSchema),
		recentCalls: z.array(adminRecentCallSchema),
		auditLog: z.array(adminAuditEntrySchema)
	})
	.meta({ id: 'AdminUserDetailResponse' });

const adminClaudeAccessSchema = z
	.object({
		enabled: z.boolean(),
		monthlyBudgetUsd: z.number().nullable(),
		effectiveBudgetUsd: z.number(),
		note: z.string().nullable(),
		grantedAt: z.string().nullable(),
		updatedAt: z.string()
	})
	.meta({ id: 'AdminClaudeAccess' });

export const adminClaudeAccessResponseSchema = z
	.object({
		access: adminClaudeAccessSchema
	})
	.meta({ id: 'AdminClaudeAccessResponse' });

const adminTopUserSchema = z
	.object({
		userId: z.string().uuid().nullable(),
		name: z.string().nullable(),
		email: z.string().nullable(),
		spendUsd: z.number(),
		calls: z.number().int()
	})
	.meta({ id: 'AdminTopUser' });

const adminClaudeRunsSchema = z
	.object({
		queued: z.number().int(),
		running: z.number().int(),
		retryWait: z.number().int(),
		blocked: z.number().int(),
		proposed: z.number().int(),
		dismissedThisMonth: z.number().int()
	})
	.meta({ id: 'AdminClaudeRuns' });

export const adminClaudeOverviewResponseSchema = z
	.object({
		configured: z.boolean(),
		enabled: z.boolean(),
		model: z.string(),
		monthStart: z.string(),
		globalBudgetUsd: z.number(),
		defaultUserBudgetUsd: z.number(),
		monthSpendUsd: z.number(),
		monthCalls: z.number().int(),
		openReservations: z.number().int(),
		topUsers: z.array(adminTopUserSchema),
		runs: adminClaudeRunsSchema
	})
	.meta({ id: 'AdminClaudeOverviewResponse' });

export const adminClaudeSettingsResponseSchema = z
	.object({
		enabled: z.boolean()
	})
	.meta({ id: 'AdminClaudeSettingsResponse' });
