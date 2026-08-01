import type {
	ActorContext,
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
} from '$lib/models';
import { InvalidGeneratedContentError } from '$lib/errors';
import type { AtomicOperation as TransactionRunner } from '$lib/utils';
import type {
	NoteReader,
	PromiseExtractor,
	ProvenanceRecorder,
	SelectionAnchorCreator,
	SuggestionAccepter,
	SuggestionCreator,
	TodoCreator,
	TodoDeleter,
	TodoEditor,
	TodoLister,
	TodoReader,
	TodoStatusChanger,
	TodoViewAssembler,
	TrustPolicyEvaluator
} from '$lib/server/services';

export interface TodosController {
	get(actor: ActorContext, input: GetTodoViewInput): Promise<TodoView>;
	list(actor: ActorContext, filter: TodoListFilter): Promise<ListTodosOutput>;
	count(actor: ActorContext, filter: TodoListFilter): Promise<number>;
	listCategories(actor: ActorContext): Promise<readonly string[]>;
	create(actor: ActorContext, input: CreateTodoInput): Promise<{ todo: Todo }>;
	update(actor: ActorContext, input: UpdateTodoInput): Promise<UpdateTodoOutput>;
	remove(actor: ActorContext, todoId: TodoId): Promise<void>;
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
