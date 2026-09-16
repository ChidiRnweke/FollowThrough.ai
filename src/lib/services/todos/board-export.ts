import type { TodoStatus, TodoPriority, TodoView, BoardMarkdownOptions } from '$lib/models/todos';

/** Columns in rendered kanban order — see kanban-board.svelte. `cancelled` never
    appears on the board, so it never appears in an export either. */
const boardColumns = [
	'backlog',
	'open',
	'in_progress',
	'done'
] as const satisfies readonly TodoStatus[];

type BoardColumn = (typeof boardColumns)[number];

const boardStatusLabels: Record<BoardColumn, string> = {
	backlog: 'Backlog',
	open: 'Open',
	in_progress: 'In progress',
	done: 'Done'
};

const boardPriorityLabels: Record<TodoPriority, string> = {
	low: 'Low',
	medium: 'Medium',
	high: 'High'
};

const generatedFormatter = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});

/** Local calendar date as YYYY-MM-DD — the LocalDate shape `dueDate` uses, and the
    date stamp in an export filename. */
export const boardExportDate = (date: Date): string =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
		date.getDate()
	).padStart(2, '0')}`;

/** A card title is one list line; multi-line titles would break the list item. */
const inlineTitle = (title: string): string => title.replace(/\s+/g, ' ').trim();

/** Filename-safe slug for a board export: `kanban-<slug>-<date>.<ext>`. */
export const boardExportSlug = (name: string): string =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '') || 'board';

/** Render the visible kanban board as a Markdown task list, one section per column. */
export function boardMarkdown(todos: readonly TodoView[], opts: BoardMarkdownOptions): string {
	const generatedAt = opts.generatedAt;
	const today = boardExportDate(generatedAt);
	const lines: string[] = [
		`# ${opts.title}`,
		'',
		`Generated ${generatedFormatter.format(generatedAt)}`
	];
	for (const status of boardColumns) {
		const column = todos.filter((item) => item.todo.status === status);
		if (column.length === 0) continue;
		lines.push('', `## ${boardStatusLabels[status]}`, '');
		for (const { todo } of column) {
			const metadata: string[] = [];
			if (todo.priority) metadata.push(boardPriorityLabels[todo.priority]);
			if (todo.dueDate) {
				const overdue = status !== 'done' && todo.dueDate < today;
				metadata.push(`due ${todo.dueDate}${overdue ? ' (overdue)' : ''}`);
			}
			const project = opts.projectNames?.get(todo.projectId);
			if (project) metadata.push(project);
			if (todo.category) metadata.push(todo.category);
			if (todo.waitingOn) metadata.push(`waiting on ${todo.waitingOn}`);
			const suffix = metadata.length > 0 ? ` · ${metadata.join(' · ')}` : '';
			lines.push(`- ${status === 'done' ? '[x]' : '[ ]'} **${inlineTitle(todo.title)}**${suffix}`);
		}
	}
	return `${lines.join('\n')}\n`;
}
