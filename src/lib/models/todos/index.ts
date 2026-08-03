type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

export type TodoId = Brand<string, 'TodoId'>;

type SuggestionId = Brand<string, 'SuggestionId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type AgentRunId = Brand<string, 'AgentRunId'>;

type MemoryEntryId = Brand<string, 'MemoryEntryId'>;

type DateTime = Brand<string, 'DateTime'>;

type LocalDate = Brand<string, 'LocalDate'>;

type Url = Brand<string, 'Url'>;

type Confidence = Brand<number, 'Confidence'>;

interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly Record<string, unknown>[];
}

interface TextSelection {
	readonly noteId: NoteId;
	readonly revision: number;
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

type NoteKind = 'folder' | 'note' | 'skill';

export type TodoStatus = 'backlog' | 'open' | 'in_progress' | 'done' | 'cancelled';

export type TodoResponsibility = 'mine' | 'waiting_on';

export type TodoPriority = 'low' | 'medium' | 'high';

export type PromiseStrength = 'explicit' | 'implied' | 'tentative';

type RelationshipKind = 'prior_decision' | 'contradicts' | 'elaborates' | 'mentions';

type DiagramKind = 'mermaid' | 'drawio';

type ReferenceTier = 'official' | 'standard' | 'vendor' | 'community';

type PipelineKind = 'extract_promises' | 'relate' | 'reference' | 'agent' | 'memory';

type ProducerKind = 'user' | 'pipeline' | 'agent';

type SuggestionStatus = 'proposed' | 'accepted' | 'rejected' | 'expired' | 'reverted';

interface Note {
	readonly id: NoteId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly parentId?: NoteId;
	readonly kind: NoteKind;
	readonly position: number;
	readonly title: string;
	readonly builtInKey?: string;
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
	readonly currentRevision: number;
	readonly publishedRevision: number;
	readonly isPinned: boolean;
	readonly publishedAt?: DateTime;
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

interface SourceAnchor {
	readonly id: SourceAnchorId;
	readonly noteId: NoteId;
	readonly nodeId?: string;
	readonly from?: number;
	readonly to?: number;
	readonly quote: string;
	readonly prefix?: string;
	readonly suffix?: string;
	readonly revision: number;
	readonly createdAt: DateTime;
}

interface Provenance {
	readonly id: ProvenanceId;
	readonly userId: UserId;
	readonly producerKind: ProducerKind;
	readonly producerName: string;
	readonly pipeline?: PipelineKind;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly runId?: AgentRunId;
	readonly model?: string;
	readonly metadata: Readonly<Record<string, unknown>>;
	readonly createdAt: DateTime;
}

/** A tracked commitment. `completedAt` is set if and only if `status` is `done`; deletion is soft, so history survives. */
export interface Todo {
	readonly id: TodoId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly title: string;
	readonly description?: string;
	readonly status: TodoStatus;
	readonly responsibility: TodoResponsibility;
	readonly priority?: TodoPriority;
	readonly category?: string;
	readonly waitingOn?: string;
	readonly dueDate?: LocalDate;
	readonly dueDateVerbatim?: string;
	readonly promiseStrength?: PromiseStrength;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly linkedNoteId?: NoteId;
	readonly provenanceId?: ProvenanceId;
	readonly completedAt?: DateTime;
	readonly deletedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

type SuggestionKind = 'todo' | 'backlink' | 'reference' | 'diagram' | 'memory';

interface SuggestionBase<Kind extends SuggestionKind, Payload> {
	readonly id: SuggestionId;
	readonly userId: UserId;
	readonly noteId?: NoteId;
	readonly kind: Kind;
	readonly status: SuggestionStatus;
	readonly payload: Payload;
	readonly confidence?: Confidence;
	readonly provenanceId: ProvenanceId;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly decidedAt?: DateTime;
	readonly expiresAt?: DateTime;
	readonly appliedArtifactId?: string;
	readonly isAutoAccepted: boolean;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export type TodoSuggestion = SuggestionBase<'todo', CreateTodoInput>;

type BacklinkSuggestion = SuggestionBase<'backlink', CreateRelationshipInput>;

type ReferenceSuggestion = SuggestionBase<'reference', CreateReferenceInput>;

type DiagramSuggestion = SuggestionBase<
	'diagram',
	{
		readonly noteId: NoteId;
		readonly kind: DiagramKind;
		readonly title?: string;
		readonly source: string;
	}
>;

type MemorySuggestion = SuggestionBase<'memory', MemoryChangePayload>;

type Suggestion =
	TodoSuggestion | BacklinkSuggestion | ReferenceSuggestion | DiagramSuggestion | MemorySuggestion;

type MemoryChangeOperation = 'add' | 'update' | 'remove';

interface MemoryChangePayload {
	readonly projectId?: ProjectId;
	readonly operation: MemoryChangeOperation;
	readonly memoryEntryId?: MemoryEntryId;
	readonly content?: string;
	readonly shareWithAgents?: boolean;
	readonly justification?: string;
}

export interface CreateTodoInput {
	readonly projectId: ProjectId;
	readonly title: string;
	readonly description?: string;
	readonly responsibility: TodoResponsibility;
	readonly waitingOn?: string;
	readonly dueDate?: LocalDate;
	readonly dueDateVerbatim?: string;
	readonly promiseStrength?: PromiseStrength;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

interface CreateRelationshipInput {
	readonly sourceNoteId: NoteId;
	readonly targetNoteId: NoteId;
	readonly kind: RelationshipKind;
	readonly justification?: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

interface CreateReferenceInput {
	readonly noteId: NoteId;
	readonly url: Url;
	readonly title: string;
	readonly tier: ReferenceTier;
	readonly relevanceNote: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

/** One commitment found by the extractor before it becomes a suggestion. `strength` (explicit/implied/tentative) drives the badge shown in the review UI. */
export interface PromiseCandidate {
	readonly action: string;
	readonly ownerName?: string;
	readonly responsibility: TodoResponsibility;
	readonly dueDateVerbatim?: string;
	readonly resolvedDueDate?: LocalDate;
	readonly strength: PromiseStrength;
	readonly confidence: number;
}

export interface ExtractPromisesInput {
	readonly selection: TextSelection;
}

/** `createdTodos` is populated only for auto-accepted candidates; everything else stays in `suggestions`, pending review. */
export interface ExtractPromisesOutput {
	readonly anchorId: SourceAnchorId;
	readonly suggestions: readonly Suggestion[];
	readonly createdTodos: readonly Todo[];
}

type NoteRef = Pick<Note, 'id' | 'title'>;

export interface TodoView {
	readonly todo: Todo;
	readonly sourceNote?: NoteRef;
	readonly originNote?: NoteRef;
	readonly anchor?: SourceAnchor;
	readonly provenance?: Provenance;
}

export interface GetTodoViewInput {
	readonly todoId: TodoId;
}

export interface TodoListFilter {
	readonly projectId?: ProjectId;
	readonly status?: TodoStatus;
	readonly responsibility?: TodoResponsibility;
	readonly noteId?: NoteId;
	readonly dueBefore?: LocalDate;
	readonly category?: string;
}

export interface ListTodosOutput {
	readonly todos: readonly TodoView[];
}

export interface UpdateTodoInput {
	readonly todoId: TodoId;
	readonly status?: TodoStatus;
	readonly title?: string;
	readonly description?: string | null;
	readonly dueDate?: LocalDate | null;
	readonly responsibility?: TodoResponsibility;
	readonly priority?: TodoPriority | null;
	readonly category?: string | null;
	readonly waitingOn?: string | null;
	readonly linkedNoteId?: NoteId | null;
}

export interface UpdateTodoOutput {
	readonly todo: Todo;
	readonly view: TodoView;
}

/* ------------------------------------------------------------------ *
 * Board export — the kanban board rendered as a Markdown task list.  *
 * ------------------------------------------------------------------ */

/** Columns in rendered kanban order — see kanban-board.svelte. `cancelled` never
    appears on the board, so it never appears in an export either. */
const boardColumns = [
	'backlog',
	'open',
	'in_progress',
	'done'
] as const satisfies readonly TodoStatus[];

type BoardColumn = (typeof boardColumns)[number];

/* Inlined rather than imported from $lib/components/shared/labels: models sit below
   the component layer, and the architecture audit rejects an upward import. */
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

export interface BoardMarkdownOptions {
	readonly title: string;
	readonly generatedAt?: Date;
	/** Project id → name; cards carry their project only when this is provided. */
	readonly projectNames?: ReadonlyMap<string, string>;
}

export interface BoardPdfExportResult {
	/** Base64-encoded PDF bytes; ephemeral, never persisted as an artifact. */
	readonly data: string;
	readonly filename: string;
}

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
	const generatedAt = opts.generatedAt ?? new Date();
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
