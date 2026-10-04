import type { LocalDate } from '$lib/models/workspace';
import type { ProjectId } from '$lib/models/projects';
import type { NoteSummary } from '$lib/models/notes';
import type { Todo, TodoStatus } from '$lib/models/todos';
import type {
	JsonValue,
	WidgetLayout,
	WidgetSourceKind,
	WidgetSourceRows
} from '$lib/models/widgets';

/** The records a widget's sources are worked out from: one project's todos and notes, and today. */
export interface WidgetSourceRecords {
	readonly projectId: ProjectId;
	readonly today: LocalDate;
	readonly todos: readonly Pick<
		Todo,
		| 'id'
		| 'projectId'
		| 'title'
		| 'status'
		| 'responsibility'
		| 'priority'
		| 'category'
		| 'dueDate'
		| 'deletedAt'
	>[];
	readonly notes: readonly Pick<
		NoteSummary,
		'id' | 'projectId' | 'title' | 'kind' | 'isPinned' | 'archivedAt' | 'updatedAt'
	>[];
}

const STATUS_LABELS: Record<TodoStatus, string> = {
	backlog: 'Backlog',
	open: 'Open',
	in_progress: 'In progress',
	done: 'Done',
	cancelled: 'Cancelled'
};

const OPEN: ReadonlySet<TodoStatus> = new Set(['backlog', 'open', 'in_progress']);

const todoRows = (records: WidgetSourceRecords): JsonValue[] =>
	records.todos
		.filter((todo) => todo.projectId === records.projectId && !todo.deletedAt)
		.toSorted(
			(a, b) => (a.dueDate ?? '￿').localeCompare(b.dueDate ?? '￿') || a.title.localeCompare(b.title)
		)
		.map((todo) => ({
			id: todo.id,
			title: todo.title,
			status: todo.status,
			statusLabel: STATUS_LABELS[todo.status],
			open: OPEN.has(todo.status),
			done: todo.status === 'done',
			overdue: OPEN.has(todo.status) && todo.dueDate !== undefined && todo.dueDate < records.today,
			waiting: todo.responsibility === 'waiting_on',
			dueDate: todo.dueDate ?? null,
			priority: todo.priority ?? null,
			category: todo.category ?? null
		}));

/** Notes a person wrote; folders and skills are structure, not work. */
const noteRows = (records: WidgetSourceRecords): JsonValue[] =>
	records.notes
		.filter(
			(note) => note.projectId === records.projectId && note.kind === 'note' && !note.archivedAt
		)
		.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.map((note) => ({
			id: note.id,
			title: note.title,
			pinned: note.isPinned,
			updatedDate: note.updatedAt.slice(0, 10)
		}));

/** One builder per source kind, so a new kind cannot be added without its rows. */
const ROWS: Record<WidgetSourceKind, (records: WidgetSourceRecords) => JsonValue[]> = {
	todos: todoRows,
	notes: noteRows
};

/**
 * The rows each source of a layout reads (ADR 0043). The browser calls this with synced records
 * and export with repository reads, so a dashboard shows the same rows wherever it is shown.
 */
export const widgetSourceRows = (
	sources: NonNullable<WidgetLayout['sources']>,
	records: WidgetSourceRecords
): WidgetSourceRows =>
	Object.fromEntries(
		Object.entries(sources).map(([name, source]) => [name, ROWS[source.kind](records)])
	);
