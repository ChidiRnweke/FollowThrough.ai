import type { ActorContext } from '$lib/models/identity';
import {
	boardExportDate,
	boardExportSlug,
	boardMarkdown,
	type BoardPdfExportResult,
	type CreateTodoInput,
	type ExtractPromisesInput,
	type ExtractPromisesOutput,
	type GetTodoViewInput,
	type ListTodosOutput,
	type Todo,
	type TodoId,
	type TodoListFilter,
	type TodoView,
	type UpdateTodoInput,
	type UpdateTodoOutput
} from '$lib/models/todos';
import { defaultExportSettings, type ExportSettings } from '$lib/models/deliverables';
import type { ProseMirrorDocument } from '$lib/models/notes';
import { InvalidGeneratedContentError } from '$lib/errors';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { NoteReader, SelectionAnchorCreator } from '$lib/server/services/notes/contracts';
import type { PromiseExtractor } from '$lib/server/services/todos/promise-extraction/contracts';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type { ProjectLister } from '$lib/server/services/projects/contracts';
import { noteContentFromMarkdown } from '$lib/server/services/notes/markdown';
import type {
	SuggestionAccepter,
	SuggestionCreator
} from '$lib/server/services/suggestions/contracts';
import type {
	TodoCreator,
	TodoDeleter,
	TodoEditor,
	TodoLister,
	TodoReader,
	TodoStatusChanger,
	TodoViewAssembler
} from '$lib/server/services/todos/contracts';
import type { TrustPolicyEvaluator } from '$lib/server/services/agent/runs/tool-trust';

// Same shape as GeneratePdfInput in deliverables/pdf.ts, mirrored here so the controller
// stays decoupled from the pdfmake-backed module — see deliverables/artifacts.ts.
interface BoardPdfInput {
	readonly notes: readonly { title: string; document: ProseMirrorDocument }[];
	readonly title: string;
	readonly settings?: ExportSettings;
}

export type BoardPdfGenerator = (input: BoardPdfInput) => Promise<Buffer>;

/**
 * Application boundary for todos: tracking, filtering, and the promise-extraction
 * pipeline that turns commitments in text into reviewable todo suggestions.
 */
export interface TodosController {
	/** Load a single todo as a view with its resolved display fields. */
	get(actor: ActorContext, input: GetTodoViewInput): Promise<TodoView>;
	/** List todos by filter, each assembled into a view. */
	list(actor: ActorContext, filter: TodoListFilter): Promise<ListTodosOutput>;
	/** Count todos matching a filter without loading them, for badges and pagination. */
	count(actor: ActorContext, filter: TodoListFilter): Promise<number>;
	/** List the distinct category names in use, for filter dropdowns. */
	listCategories(actor: ActorContext): Promise<readonly string[]>;
	/** Render the board matching a filter as an ephemeral PDF download. */
	exportBoardPdf(actor: ActorContext, filter: TodoListFilter): Promise<BoardPdfExportResult>;
	/** Create a todo. */
	create(actor: ActorContext, input: CreateTodoInput): Promise<{ todo: Todo }>;
	/**
	 * Apply a partial edit to a todo: merges only the supplied fields, then applies a
	 * status change when the status differs from the current one.
	 *
	 * @throws InvalidGeneratedContentError if no edit is supplied at all — an update
	 * that changes nothing is a caller bug, not a no-op.
	 */
	update(actor: ActorContext, input: UpdateTodoInput): Promise<UpdateTodoOutput>;
	/** Soft-delete a todo so it disappears from lists while its history survives. */
	remove(actor: ActorContext, todoId: TodoId): Promise<void>;
	/**
	 * Extract commitments from a text selection and create one reviewable todo
	 * suggestion per candidate, in one transaction.
	 *
	 * Suggestions the trust policy deems safe are auto-accepted into real todos; the
	 * rest stay pending for review. Returns both the created suggestions and any todos
	 * auto-created from them.
	 */
	extractPromises(actor: ActorContext, input: ExtractPromisesInput): Promise<ExtractPromisesOutput>;
}
export interface TodosDependencies {
	todoLister: TodoLister;
	todoViewAssembler: TodoViewAssembler;
	todoReader: TodoReader;
	todoEditor: TodoEditor;
	todoDeleter: TodoDeleter;
	todoStatusChanger: TodoStatusChanger;
	anchorCreator: SelectionAnchorCreator;
	promiseExtractor: PromiseExtractor;
	provenanceRecorder: ProvenanceRecorder;
	suggestionCreator: SuggestionCreator;
	trustPolicyEvaluator: TrustPolicyEvaluator;
	todoCreator: TodoCreator;
	suggestionAccepter: SuggestionAccepter;
	noteReader: NoteReader;
	transactionRunner: TransactionRunner;
	projectLister: ProjectLister;
	boardPdfGenerator: BoardPdfGenerator;
}
export class Todos implements TodosController {
	constructor(private readonly dependencies: TodosDependencies) {}
	async get(actor: ActorContext, input: GetTodoViewInput): Promise<TodoView> {
		const todo = await this.dependencies.todoReader.get(actor, input.todoId);
		const [view] = await this.dependencies.todoViewAssembler.assemble(actor, [todo]);
		return view!;
	}
	async list(actor: ActorContext, filter: TodoListFilter): Promise<ListTodosOutput> {
		const todos = await this.dependencies.todoLister.list(actor, filter);
		return { todos: await this.dependencies.todoViewAssembler.assemble(actor, todos) };
	}
	async count(actor: ActorContext, filter: TodoListFilter): Promise<number> {
		return this.dependencies.todoLister.count(actor, filter);
	}
	async listCategories(actor: ActorContext): Promise<readonly string[]> {
		return this.dependencies.todoLister.listCategories(actor);
	}
	async exportBoardPdf(actor: ActorContext, filter: TodoListFilter): Promise<BoardPdfExportResult> {
		/* Orchestrated here rather than in a service: a service may not import another
		   service, and this export needs the todo catalog, the project catalog, the
		   Markdown converter and the PDF pipeline together. Ephemeral by design — the
		   bytes stream straight to the download as base64, with no artifact record. */
		const [{ todos }, projects] = await Promise.all([
			this.list(actor, filter),
			this.dependencies.projectLister.list(actor)
		]);
		const projectNames = new Map(projects.map((project) => [project.id, project.name]));
		const generatedAt = new Date();
		const projectName = filter.projectId ? projectNames.get(filter.projectId) : undefined;
		const title = projectName ? `${projectName} todos` : 'Todos';
		const { document } = noteContentFromMarkdown(
			boardMarkdown(todos, { title, generatedAt, projectNames })
		);
		const pdf = await this.dependencies.boardPdfGenerator({
			title,
			notes: [{ title, document }],
			settings: { ...defaultExportSettings, includeTitle: true }
		});
		return {
			data: pdf.toString('base64'),
			filename: `kanban-${boardExportSlug(projectName ?? 'all')}-${boardExportDate(generatedAt)}.pdf`
		};
	}
	async create(actor: ActorContext, input: CreateTodoInput): Promise<{ todo: Todo }> {
		const todo = await this.dependencies.todoCreator.create(actor, input);
		return { todo };
	}
	async update(actor: ActorContext, input: UpdateTodoInput): Promise<UpdateTodoOutput> {
		if (Object.keys(input).every((key) => key === 'todoId')) {
			throw new InvalidGeneratedContentError('A todo update requires at least one edit');
		}
		let todo = await this.dependencies.todoReader.get(actor, input.todoId);
		const edits: Partial<
			Pick<
				Todo,
				| 'title'
				| 'description'
				| 'dueDate'
				| 'responsibility'
				| 'priority'
				| 'category'
				| 'waitingOn'
				| 'linkedNoteId'
			>
		> = {
			...(input.title !== undefined ? { title: input.title } : {}),
			...(input.description !== undefined ? { description: input.description ?? undefined } : {}),
			...(input.dueDate !== undefined ? { dueDate: input.dueDate ?? undefined } : {}),
			...(input.responsibility !== undefined ? { responsibility: input.responsibility } : {}),
			...(input.priority !== undefined ? { priority: input.priority ?? undefined } : {}),
			...(input.category !== undefined ? { category: input.category?.trim() || undefined } : {}),
			...(input.waitingOn !== undefined ? { waitingOn: input.waitingOn ?? undefined } : {}),
			...(input.linkedNoteId !== undefined ? { linkedNoteId: input.linkedNoteId ?? undefined } : {})
		};
		if (Object.keys(edits).length > 0) {
			todo = await this.dependencies.todoEditor.update(actor, { ...todo, ...edits });
		}
		if (input.status !== undefined && input.status !== todo.status) {
			todo = await this.dependencies.todoStatusChanger.change(actor, input.todoId, input.status);
		}
		const [view] = await this.dependencies.todoViewAssembler.assemble(actor, [todo]);
		return { todo, view: view! };
	}
	async remove(actor: ActorContext, todoId: TodoId): Promise<void> {
		await this.dependencies.todoReader.get(actor, todoId);
		await this.dependencies.todoDeleter.softDelete(actor, todoId);
	}
	async extractPromises(
		actor: ActorContext,
		input: ExtractPromisesInput
	): Promise<ExtractPromisesOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const [anchor, note] = await Promise.all([
				this.dependencies.anchorCreator.create(actor, input.selection),
				this.dependencies.noteReader.get(actor, input.selection.noteId)
			]);
			const candidates = await this.dependencies.promiseExtractor.extract(actor, input.selection);
			const provenance = await this.dependencies.provenanceRecorder.record(actor, {
				producerKind: 'pipeline',
				producerName: 'Extract Promises',
				pipeline: 'extract_promises',
				sourceAnchorId: anchor.id,
				metadata: {}
			});
			const suggestions = [];
			const createdTodos: Todo[] = [];
			for (const candidate of candidates) {
				const suggestion = await this.dependencies.suggestionCreator.create(actor, {
					kind: 'todo',
					noteId: input.selection.noteId,
					confidence: candidate.confidence,
					provenanceId: provenance.id,
					sourceAnchorId: anchor.id,
					payload: {
						projectId: note.projectId,
						title: candidate.action,
						responsibility: candidate.responsibility,
						dueDateVerbatim: candidate.dueDateVerbatim,
						dueDate: candidate.resolvedDueDate,
						promiseStrength: candidate.strength,
						sourceAnchorId: anchor.id,
						provenanceId: provenance.id
					}
				});
				if (suggestion.kind !== 'todo')
					throw new InvalidGeneratedContentError(
						'Suggestion creator returned a non-todo suggestion for a todo proposal'
					);
				if (
					await this.dependencies.trustPolicyEvaluator.shouldAutoAccept(
						actor,
						'extract_promises',
						suggestion
					)
				) {
					const todo = await this.dependencies.todoCreator.create(actor, suggestion.payload);
					createdTodos.push(todo);
					await this.dependencies.suggestionAccepter.accept(actor, suggestion, todo.id, true);
				}
				suggestions.push(suggestion);
			}
			return { anchorId: anchor.id, suggestions, createdTodos };
		});
	}
}
