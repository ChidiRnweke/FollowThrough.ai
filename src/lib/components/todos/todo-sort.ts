import type { ProjectId } from '$lib/models/projects';
import type { TodoView } from '$lib/models/todos';

export type TodoSortKey =
	'title' | 'project' | 'status' | 'priority' | 'category' | 'due' | 'responsibility' | 'source';

export type TodoSortDir = 'asc' | 'desc';

// Workflow order, matching todoStatusLabels; urgency-first for priority.
const statusOrder = ['backlog', 'open', 'in_progress', 'done', 'cancelled'] as const;
const priorityOrder = ['high', 'medium', 'low'] as const;
const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

function sortValue(
	view: TodoView,
	key: TodoSortKey,
	projectNames?: ReadonlyMap<ProjectId, string>
): string | number | null {
	switch (key) {
		case 'title':
			return view.todo.title;
		case 'project':
			return projectNames?.get(view.todo.projectId) ?? null;
		case 'status':
			return statusOrder.indexOf(view.todo.status);
		case 'priority':
			return view.todo.priority ? priorityOrder.indexOf(view.todo.priority) : null;
		case 'category':
			return view.todo.category ?? null;
		case 'due':
			return view.todo.dueDate ?? null;
		case 'responsibility':
			return view.todo.responsibility;
		case 'source':
			return view.sourceNote?.title ?? null;
	}
}

/**
 * Orders todo views for the table. A null key preserves the incoming (server)
 * order. Null values always sort last, whichever direction.
 */
export function sortTodoViews(
	views: readonly TodoView[],
	key: TodoSortKey | null,
	dir: TodoSortDir,
	projectNames?: ReadonlyMap<ProjectId, string>
): readonly TodoView[] {
	if (!key) return views;
	const sign = dir === 'asc' ? 1 : -1;
	return views.toSorted((a, b) => {
		const va = sortValue(a, key, projectNames);
		const vb = sortValue(b, key, projectNames);
		if (va === null && vb === null) return 0;
		if (va === null) return 1;
		if (vb === null) return -1;
		const cmp =
			typeof va === 'number' && typeof vb === 'number'
				? va - vb
				: collator.compare(String(va), String(vb));
		return cmp * sign;
	});
}
