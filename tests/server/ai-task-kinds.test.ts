import { describe, expect, test } from 'vitest';
import { legacyAiTaskProcessor, legacyProcessedBy } from '../../src/lib/server/ai-task-kinds';
import { serializeAiTask } from '../../src/lib/server/ai-tasks';
import { preferencesUpdateSchema } from '../../src/lib/server/validation';
import { aiTaskUpdateSchema } from '../../src/lib/server/validation/ai-tasks';
import { aiTaskProposalAcceptSchema } from '../../src/lib/server/validation/ai-tasks';
import { aiTaskProcessorValues, aiTaskProcessedByValues } from '../../src/lib/server/schema';

describe('legacy kind mapping', () => {
	test('maps claude to assistant and leaves every other value alone', () => {
		expect(legacyAiTaskProcessor('claude')).toBe('assistant');
		expect(legacyAiTaskProcessor('assistant')).toBe('assistant');
		expect(legacyAiTaskProcessor('device')).toBe('device');
		expect(legacyProcessedBy('claude')).toBe('assistant');
		expect(legacyProcessedBy('on_device')).toBe('on_device');
		expect(legacyProcessedBy('private_cloud')).toBe('private_cloud');
		expect(legacyProcessedBy(null)).toBeNull();
	});

	test('legacy outputs always stay inside the legacy enums', () => {
		for (const kind of [...aiTaskProcessorValues, 'claude']) {
			expect(aiTaskProcessorValues).toContain(legacyAiTaskProcessor(kind));
		}
		for (const kind of [...aiTaskProcessedByValues, 'claude']) {
			expect(aiTaskProcessedByValues).toContain(legacyProcessedBy(kind));
		}
	});
});

describe('serializeAiTask', () => {
	const task = {
		id: 't1',
		status: 'pending',
		description: 'toast',
		photoUrls: ['/uploads/a.webp', '/uploads/b.webp'],
		processedBy: null as string | null,
		resultSummary: 'kept'
	};

	test('keeps every existing field and the photoUrl mirror', () => {
		const serialized = serializeAiTask(task);
		expect(serialized).toMatchObject({ ...task, photoUrl: '/uploads/a.webp' });
		expect(serialized.processedBy).toBeNull();
		expect(serialized.processedByKind).toBeNull();
		expect(serialized.claudeProcessing).toBeNull();
	});

	test('overrides only processedBy for claude and carries the raw value', () => {
		const serialized = serializeAiTask({ ...task, processedBy: 'claude' });
		expect(serialized.processedBy).toBe('assistant');
		expect(serialized.processedByKind).toBe('claude');
		expect(serialized.resultSummary).toBe('kept');
	});

	test('passes claude processing through', () => {
		const claudeProcessing = { state: 'queued' as const, proposal: null };
		expect(serializeAiTask(task, claudeProcessing).claudeProcessing).toEqual(claudeProcessing);
	});
});

describe('validation', () => {
	test('preferences accept claude as the processor', () => {
		expect(preferencesUpdateSchema.safeParse({ aiTaskProcessor: 'claude' }).success).toBe(true);
		expect(preferencesUpdateSchema.safeParse({ aiTaskProcessor: 'bogus' }).success).toBe(false);
	});

	test('task updates still cannot record claude as the processor', () => {
		expect(aiTaskUpdateSchema.safeParse({ processedBy: 'claude' }).success).toBe(false);
	});

	test('accept body is optional and bounded', () => {
		const id = '10000000-0000-4000-8000-0000000000d2';
		expect(aiTaskProposalAcceptSchema.safeParse({}).success).toBe(true);
		expect(aiTaskProposalAcceptSchema.safeParse({ itemIds: [id] }).success).toBe(true);
		expect(aiTaskProposalAcceptSchema.safeParse({ itemIds: [] }).success).toBe(false);
		expect(aiTaskProposalAcceptSchema.safeParse({ itemIds: Array(31).fill(id) }).success).toBe(
			false
		);
	});
});
