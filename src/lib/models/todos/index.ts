import type { Provenance } from '$lib/models/provenance';
import { z } from 'zod';
type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

export type TodoId = Brand<string, 'TodoId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type DateTime = Brand<string, 'DateTime'>;

type LocalDate = Brand<string, 'LocalDate'>;

interface TextSelection {
	readonly noteId: NoteId;
	readonly revision: number;
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

export type TodoStatus = 'backlog' | 'open' | 'in_progress' | 'done' | 'cancelled';

export type TodoResponsibility = 'mine' | 'waiting_on';

export type TodoPriority = 'low' | 'medium' | 'high';

export type PromiseStrength = 'explicit' | 'implied' | 'tentative';

export const DEFAULT_PROMISE_MODEL = 'deepseek/deepseek-v4-flash';

export interface PromiseModelContext {
	readonly model: string;
	readonly requestedAt: DateTime;
}

export const promiseExtractionSchema = z.object({
	promises: z.array(
		z.object({
			action: z.string().min(1),
			ownerName: z.string().nullable(),
			responsibility: z.enum(['mine', 'waiting_on']),
			dueDateVerbatim: z.string().nullable(),
			resolvedDueDate: z.string().nullable(),
			strength: z.enum(['explicit', 'implied', 'tentative']),
			confidence: z.number().int().min(0).max(100)
		})
	)
});

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

export interface CreateTodoInput {
	readonly id?: TodoId;
	readonly status?: TodoStatus;
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

const batchProjectId = z.uuid().transform((value) => value as ProjectId);
const batchLocalDate = z.iso.date().transform((value) => value as LocalDate);
export const createTodoBatchSchema = z
	.object({
		requestId: z
			.uuid()
			.describe(
				'A unique ID for this batch. Reuse it with identical input after an uncertain outcome.'
			),
		projectId: batchProjectId,
		todos: z
			.array(
				z
					.object({
						title: z.string().trim().min(1),
						description: z.string().optional(),
						responsibility: z.enum(['mine', 'waiting_on']),
						waitingOn: z.string().optional(),
						dueDate: batchLocalDate.optional()
					})
					.strict()
			)
			.min(1)
			.max(20)
	})
	.strict();
export type CreateTodoBatchInput = z.infer<typeof createTodoBatchSchema>;
export interface CreateTodoBatchOutput {
	readonly todos: readonly Todo[];
}
export type TodoBatchLookup =
	| { readonly kind: 'missing' }
	| { readonly kind: 'reused' }
	| { readonly kind: 'saved'; readonly result: CreateTodoBatchOutput };

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
	/** Limit extracted commitments to one responsibility; omit to keep every actor. */
	readonly responsibility?: TodoResponsibility;
}

export interface StartExtractPromisesInput extends ExtractPromisesInput {
	readonly requestId: string;
}

export const startExtractPromisesSchema: z.ZodType<StartExtractPromisesInput> = z
	.object({
		requestId: z.uuid(),
		selection: z
			.object({
				noteId: z.uuid().transform((value) => value as NoteId),
				revision: z.number().int().positive(),
				from: z.number().int().nonnegative(),
				to: z.number().int().nonnegative(),
				text: z.string()
			})
			.strict()
			.refine(
				(selection) => selection.to >= selection.from,
				'Selection end must follow its start.'
			),
		responsibility: z.enum(['mine', 'waiting_on']).optional()
	})
	.strict();

/** `createdTodos` is populated only for auto-accepted candidates; everything else stays in `suggestions`, pending review. */
export interface ExtractPromisesOutput<Proposal> {
	readonly anchorId: SourceAnchorId;
	readonly suggestions: readonly Proposal[];
	readonly createdTodos: readonly Todo[];
}

/** The identity and label needed to navigate to a note. */
interface NoteRef {
	readonly id: NoteId;
	readonly title: string;
}

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

export interface BoardMarkdownOptions {
	readonly title: string;
	readonly generatedAt: Date;
	/** Project id → name; cards carry their project only when this is provided. */
	readonly projectNames?: ReadonlyMap<string, string>;
}

export interface BoardPdfExportResult {
	/** Base64-encoded PDF bytes; ephemeral, never persisted as an artifact. */
	readonly data: string;
	readonly filename: string;
}

/** Local preview of the same fields accepted by a todo edit. Null clears a nullable field. */
export function applyTodoEdit(
	todo: Todo,
	input: Omit<UpdateTodoInput, 'todoId'>,
	timestamp: DateTime
): Todo {
	const edited: Todo = {
		...todo,
		...(input.title !== undefined ? { title: input.title.trim() } : {}),
		...(input.description !== undefined ? { description: input.description ?? undefined } : {}),
		...(input.dueDate !== undefined ? { dueDate: input.dueDate ?? undefined } : {}),
		...(input.responsibility !== undefined ? { responsibility: input.responsibility } : {}),
		...(input.priority !== undefined ? { priority: input.priority ?? undefined } : {}),
		...(input.category !== undefined ? { category: input.category?.trim() || undefined } : {}),
		...(input.waitingOn !== undefined ? { waitingOn: input.waitingOn?.trim() || undefined } : {}),
		...(input.linkedNoteId !== undefined ? { linkedNoteId: input.linkedNoteId ?? undefined } : {}),
		...(input.status !== undefined && input.status !== todo.status
			? { status: input.status, completedAt: input.status === 'done' ? timestamp : undefined }
			: {}),
		updatedAt: timestamp
	};
	return { ...edited, waitingOn: edited.responsibility === 'mine' ? undefined : edited.waitingOn };
}

/** A linked note supplies the task's display source; its extraction origin stays visible separately. */
export function assembleTodoView(
	todo: Todo,
	facts: {
		readonly anchor: SourceAnchor | null;
		readonly origin: NoteRef | null;
		readonly linked: NoteRef | null;
		readonly provenance: Provenance | null;
	}
): TodoView {
	const source = facts.linked ?? facts.origin;
	return {
		todo,
		...(source ? { sourceNote: { id: source.id, title: source.title } } : {}),
		...(facts.origin ? { originNote: { id: facts.origin.id, title: facts.origin.title } } : {}),
		...(facts.anchor ? { anchor: facts.anchor } : {}),
		...(facts.provenance ? { provenance: facts.provenance } : {})
	};
}

/** Produce the initial task state without generating identities or writing storage. */
export function decideTodoCreation(
	input: CreateTodoInput,
	context: { readonly id: TodoId; readonly userId: UserId; readonly timestamp: DateTime }
): { kind: 'invalid'; message: string } | { kind: 'create'; todo: Todo } {
	const title = input.title.trim();
	if (!title) return { kind: 'invalid', message: 'Todo title is required' };
	const todo: Todo = {
		id: context.id,
		userId: context.userId,
		projectId: input.projectId,
		title,
		...(input.description !== undefined ? { description: input.description } : {}),
		status: input.status ?? 'open',
		responsibility: input.responsibility,
		...(input.responsibility === 'waiting_on' && input.waitingOn?.trim()
			? { waitingOn: input.waitingOn.trim() }
			: {}),
		...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
		...(input.dueDateVerbatim !== undefined ? { dueDateVerbatim: input.dueDateVerbatim } : {}),
		...(input.promiseStrength !== undefined ? { promiseStrength: input.promiseStrength } : {}),
		...(input.sourceAnchorId !== undefined ? { sourceAnchorId: input.sourceAnchorId } : {}),
		...(input.provenanceId !== undefined ? { provenanceId: input.provenanceId } : {}),
		...(input.status === 'done' ? { completedAt: context.timestamp } : {}),
		createdAt: context.timestamp,
		updatedAt: context.timestamp
	};
	return { kind: 'create', todo };
}
