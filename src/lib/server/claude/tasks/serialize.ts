import { serializeAiTask } from '../../ai-tasks';
import { listRunsByTaskIds } from './runs';
import { serializeClaudeProcessing } from './proposal';

type SerializableTask = Parameters<typeof serializeAiTask>[0] & { id: string; status: string };

export async function serializeAiTasksWithRuns<T extends SerializableTask>(tasks: T[]) {
	const runs = new Map(
		(await listRunsByTaskIds(tasks.map((task) => task.id))).map((r) => [r.taskId, r])
	);
	return tasks.map((task) =>
		serializeAiTask(task, serializeClaudeProcessing(runs.get(task.id), task.status))
	);
}

export async function serializeAiTaskWithRun<T extends SerializableTask>(task: T) {
	const [serialized] = await serializeAiTasksWithRuns([task]);
	return serialized;
}
