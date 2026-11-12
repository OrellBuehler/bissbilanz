import { serializeAiTask } from '../../ai-tasks';
import { listRunsByTaskIds } from './runs';
import { serializeClaudeProcessing } from './proposal';
import { loadClaudeThreads } from './replies';

type SerializableTask = Parameters<typeof serializeAiTask>[0] & {
	id: string;
	userId: string;
	status: string;
};

export async function serializeAiTasksWithRuns<T extends SerializableTask>(tasks: T[]) {
	const [runs, threads] = await Promise.all([
		listRunsByTaskIds(tasks.map((task) => task.id)),
		loadClaudeThreads(tasks)
	]);
	const byTask = new Map(runs.map((r) => [r.taskId, r]));
	return tasks.map((task) =>
		serializeAiTask(
			task,
			serializeClaudeProcessing(byTask.get(task.id), task.status),
			threads.get(task.id) ?? null
		)
	);
}

export async function serializeAiTaskWithRun<T extends SerializableTask>(task: T) {
	const [serialized] = await serializeAiTasksWithRuns([task]);
	return serialized;
}
