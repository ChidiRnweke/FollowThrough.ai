import type { ActorContext } from '$lib/models/identity';
import type {
	BoardPdfExportResult,
	CreateTodoInput,
	ExtractPromisesInput,
	ExtractPromisesOutput,
	GetTodoViewInput,
	ListTodosOutput,
	Todo,
	TodoId,
	TodoListFilter,
	TodoView,
	UpdateTodoInput,
	UpdateTodoOutput
} from '$lib/models/todos';
import { InvalidGeneratedContentError } from '$lib/errors';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { NoteReader, SelectionAnchorCreator } from '$lib/server/services/notes/contracts';
import type { PromiseExtractor } from '$lib/server/services/todos/promise-extraction/contracts';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type {
	SuggestionAccepter,
	SuggestionCreator
} from '$lib/server/services/suggestions/contracts';
import type {
	BoardPdfExporter,
	TodoCreator,
	TodoDeleter,
	TodoEditor,
	TodoLister,
	TodoReader,
	TodoStatusChanger,
	TodoViewAssembler
} from '$lib/server/services/todos/contracts';
import type { TrustPolicyEvaluator } from '$lib/server/services/agent/runs/tool-trust';
import type { AgentRunReceipt } from '$lib/models/agent';
import type { WorkflowRunStarter } from '$lib/server/services/agent/runs/workflow';

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
	extractPromises(
		actor: ActorContext,
		input: ExtractPromisesInput,
		signal?: AbortSignal
	): Promise<ExtractPromisesOutput>;
	/**
	 * Start {@link extractPromises} as a cancellable run, returning once the run is
	 * durable rather than once the extraction is done. Its result arrives as a
	 * `workflow_result` event, so a client that refreshes mid-run can still collect it.
	 */
	startExtractPromises(actor: ActorContext, input: ExtractPromisesInput): Promise<AgentRunReceipt>;
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
	boardPdfExporter: BoardPdfExporter;
	workflowRunner: WorkflowRunStarter;
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
		return this.dependencies.boardPdfExporter.exportBoardPdf(actor, filter);
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
	startExtractPromises(actor: ActorContext, input: ExtractPromisesInput): Promise<AgentRunReceipt> {
		return this.dependencies.workflowRunner.start(actor, {
			action: 'promises',
			noteId: input.selection.noteId,
			title: 'Extract promises',
			run: (signal) => this.extractPromises(actor, input, signal)
		});
	}
	async extractPromises(
		actor: ActorContext,
		input: ExtractPromisesInput,
		signal?: AbortSignal
	): Promise<ExtractPromisesOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const [anchor, note] = await Promise.all([
				this.dependencies.anchorCreator.create(actor, input.selection),
				this.dependencies.noteReader.get(actor, input.selection.noteId)
			]);
			const candidates = await this.dependencies.promiseExtractor.extract(
				actor,
				input.selection,
				signal
			);
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
