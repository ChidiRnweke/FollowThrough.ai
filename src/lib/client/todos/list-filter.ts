import { z } from 'zod';
import type { TodoListFilter } from '$lib/models/todos';
import { todoRecordSchema } from '$lib/models/workspace-records';
const filterSchema = z.object({
	status: todoRecordSchema.shape.status.optional(),
	responsibility: todoRecordSchema.shape.responsibility.optional(),
	projectId: todoRecordSchema.shape.projectId.optional(),
	category: z.string().min(1).optional()
});
/** Shared URL boundary for workspace and project task lists. */
export const readTodoListFilter = (params: URLSearchParams): TodoListFilter =>
	filterSchema.parse(
		Object.fromEntries(
			['status', 'responsibility', 'projectId', 'category'].flatMap((key) => {
				const value = params.get(key);
				return value === null || value === '' ? [] : [[key, value]];
			})
		)
	);
