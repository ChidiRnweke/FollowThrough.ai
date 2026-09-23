import { z } from 'zod';
import type { TodoListFilter } from '$lib/models/todos';
import { todoRecordFields } from '$lib/models/workspace-records';
const filterSchema = z.object({
	status: todoRecordFields.status.optional(),
	responsibility: todoRecordFields.responsibility.optional(),
	projectId: todoRecordFields.projectId.optional(),
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
