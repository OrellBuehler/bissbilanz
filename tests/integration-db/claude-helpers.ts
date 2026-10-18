import type Anthropic from '@anthropic-ai/sdk';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '$lib/server/schema';

export type PoolDB = ReturnType<typeof drizzle<typeof schema>>;

export const claudeTestConfig = {
	model: 'claude-opus-5-5',
	effort: 'medium' as const,
	maxIterations: 10,
	maxWebSearches: 3,
	globalMonthlyBudgetUsd: 90,
	defaultUserBudgetUsd: 10,
	configured: true
};

export const TEST_API_KEY = 'sk-ant-test-secret-key-0000';

export const claudeConfigMock = () => ({
	claudeConfig: () => claudeTestConfig,
	claudeApiKey: () => TEST_API_KEY,
	isClaudeConfigured: () => claudeTestConfig.configured
});

export function resetClaudeTestConfig() {
	claudeTestConfig.model = 'claude-opus-5-5';
	claudeTestConfig.maxIterations = 10;
	claudeTestConfig.maxWebSearches = 3;
	claudeTestConfig.globalMonthlyBudgetUsd = 90;
	claudeTestConfig.defaultUserBudgetUsd = 10;
	claudeTestConfig.configured = true;
}

export function openPool(url: string, max = 5) {
	const client = postgres(url, { max });
	return { db: drizzle(client, { schema }), client };
}

type ContentBlock = Record<string, unknown>;

export const textBlock = (text: string): ContentBlock => ({ type: 'text', text, citations: null });
export const thinkingBlock = (): ContentBlock => ({
	type: 'thinking',
	thinking: 'considering the meal',
	signature: 'sig-abc'
});
export const toolUse = (
	name: string,
	input: Record<string, unknown>,
	id?: string
): ContentBlock => ({
	type: 'tool_use',
	id: id ?? `toolu_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`,
	name,
	input
});

export function message(
	content: ContentBlock[],
	stopReason: Anthropic.StopReason,
	options: { model?: string; usage?: Partial<Anthropic.Usage> } = {}
): Anthropic.Message {
	return {
		id: `msg_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`,
		type: 'message',
		role: 'assistant',
		model: options.model ?? 'claude-opus-5-5',
		content,
		stop_reason: stopReason,
		stop_sequence: null,
		stop_details: null,
		usage: {
			input_tokens: 1000,
			output_tokens: 200,
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
			cache_creation: null,
			inference_geo: null,
			output_tokens_details: null,
			server_tool_use: null,
			service_tier: 'standard',
			...options.usage
		}
	} as unknown as Anthropic.Message;
}

export type FakeStep =
	| Anthropic.Message
	| Error
	| ((
			params: Anthropic.MessageCreateParamsNonStreaming,
			options: { signal?: AbortSignal }
	  ) => Promise<Anthropic.Message> | Anthropic.Message);

export function createFakeClaude(steps: FakeStep[] = []) {
	const queue = [...steps];
	const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
	return {
		calls,
		queue,
		messages: {
			async create(
				params: Anthropic.MessageCreateParamsNonStreaming,
				options: { signal?: AbortSignal } = {}
			): Promise<Anthropic.Message> {
				calls.push(structuredClone(params));
				const step = queue.shift();
				if (!step) throw new Error('Fake Claude client has no more scripted responses');
				if (step instanceof Error) throw step;
				if (typeof step === 'function') return step(params, options);
				return step;
			}
		}
	};
}

export function abortable<T>(signal: AbortSignal | undefined, onAbort: () => Error): Promise<T> {
	return new Promise<T>((_resolve, reject) => {
		if (signal?.aborted) return reject(onAbort());
		signal?.addEventListener('abort', () => reject(onAbort()), { once: true });
	});
}

export async function setKillSwitch(db: PoolDB, enabled: boolean) {
	await db
		.insert(schema.appSettings)
		.values({ key: 'claude_enabled', value: enabled })
		.onConflictDoUpdate({ target: schema.appSettings.key, set: { value: enabled } });
}

export async function seedUser(
	db: PoolDB,
	options: {
		processor?: 'assistant' | 'device' | 'claude';
		autoLog?: boolean;
		access?: boolean | null;
		budget?: number | null;
		locale?: string;
		timeZone?: string;
	} = {}
) {
	const [user] = await db
		.insert(schema.users)
		.values({
			infomaniakSub: `claude-${crypto.randomUUID()}`,
			email: `${crypto.randomUUID()}@example.test`,
			locale: options.locale ?? 'en'
		})
		.returning();
	await db.insert(schema.userPreferences).values({
		userId: user!.id,
		aiTaskProcessor: options.processor ?? 'claude',
		aiTaskAutoLog: options.autoLog ?? true,
		timeZone: options.timeZone ?? 'Europe/Zurich'
	});
	if (options.access !== null) {
		await db.insert(schema.claudeAccess).values({
			userId: user!.id,
			enabled: options.access ?? true,
			monthlyBudgetUsd: options.budget ?? null
		});
	}
	return user!;
}

export async function seedTask(
	db: PoolDB,
	userId: string,
	values: Partial<typeof schema.aiTasks.$inferInsert> = {}
) {
	const [task] = await db
		.insert(schema.aiTasks)
		.values({
			userId,
			description: '2 eggs and toast',
			date: '2026-10-12',
			mealType: 'Breakfast',
			...values
		})
		.returning();
	return task!;
}
