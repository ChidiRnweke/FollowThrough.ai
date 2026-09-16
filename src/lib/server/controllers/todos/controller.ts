import { assembleTodoView } from '$lib/services/todos/presentation';
import { mutationResource } from '$lib/services/workspace/commands';
import type { SuggestionEffectService } from '$lib/server/services/suggestions/contracts';
import type { TodoSuggestion } from '$lib/models/suggestions';
import type { TodoBatchReceipts } from '$lib/server/services/todos/batch-receipts';
import type { TodoMutationRequest, WorkspaceMutationResult } from '$lib/models/workspace-mutations';
import type { WorkspaceMutationReceipts } from '$lib/server/services/workspace/mutation-receipts';
import type { ActorContext } from '$lib/models/identity';
import type { Project } from '$lib/models/projects';
import { defaultExportSettings, type PreparedExport } from '$lib/models/deliverables';
import { boardExportDate, boardExportSlug, boardMarkdown } from '$lib/services/todos/board-export';
import type { noteContentFromMarkdown } from '$lib/server/services/notes/markdown';
import type { prepareExport } from '$lib/server/services/deliverables/export-preparation';
import type {
	BoardPdfExportResult,
	CreateTodoInput,
	CreateTodoBatchInput,
	CreateTodoBatchOutput,
	ExtractPromisesInput,
	StartExtractPromisesInput,
	PromiseCandidate,
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
import { InvalidGeneratedContentError, InvalidTransitionError } from '$lib/errors';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { SelectionOriginService } from '$lib/server/services/notes/contracts';
import type { PromiseExtractor } from '$lib/server/services/todos/promise-extraction/contracts';
import type { IPromiseRules } from '$lib/server/services/todos/promise-rules';
import type { DateTime } from '$lib/models/workspace';
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
	TodoContextReader
} from '$lib/server/services/todos/contracts';
import type { TrustPolicyEvaluator } from '$lib/server/services/agent/runs/tool-trust';
import type { AgentRunReceipt, AgentRunId, RunSettlementOutcome } from '$lib/models/agent';
import type { SelectionGeneration } from '$lib/models/agent';
import {
	DuplicateNoteActionRequest,
	type NoteActionRequests
} from '$lib/server/services/agent/runs/note-action-requests';
import type { RunSettlement } from '$lib/server/services/agent/runs/settlement';
import type { AgentEventBus } from '$lib/server/services/agent/runs/events';
import { registerActiveRun, releaseActiveRun } from '$lib/server/services/agent/runs/active-runs';

/**
 * Application boundary for todos: tracking, filtering, and the promise-extraction
 * pipeline that turns commitments in text into reviewable todo suggestions.
 */
export interface TodosController {
	synchronize(actor: ActorContext, input: TodoMutationRequest): Promise<WorkspaceMutationResult>;
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
	/** Commit all tasks in input order; repeated requests return the saved outcome. */
	createBatch(actor: ActorContext, input: CreateTodoBatchInput): Promise<CreateTodoBatchOutput>;
	/**
	 * Validate and persist the supplied fields and status as one complete edit.
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
	): Promise<ExtractPromisesOutput<TodoSuggestion>>;
	/**
	 * Start {@link extractPromises} as a cancellable run, returning once the run is
	 * durable rather than once the extraction is done. Its result arrives as a
	 * `workflow_result` event, so a client that refreshes mid-run can still collect it.
	 */
	startExtractPromises(
		actor: ActorContext,
		input: StartExtractPromisesInput
	): Promise<AgentRunReceipt>;
	executePromiseRun(actor: ActorContext, runId: AgentRunId): Promise<void>;
	recoverQueuedPromiseRuns(): Promise<number>;
}
export interface TodosDependencies {
	syncMutations: Pick<WorkspaceMutationReceipts, 'prepare' | 'complete' | 'reject'>;
	syncRetry: 'database-only' | 'never';
	todoLister: TodoLister;
	todoContextReader: TodoContextReader;
	todoReader: TodoReader;
	todoEditor: TodoEditor;
	todoDeleter: TodoDeleter;
	selectionOrigins: SelectionOriginService;
	promiseExtractor: PromiseExtractor;
	suggestionCreator: SuggestionCreator;
	trustPolicyEvaluator: TrustPolicyEvaluator;
	todoCreator: TodoCreator;
	todoBatchReceipts: Pick<TodoBatchReceipts, 'findForUpdate' | 'save'>;
	suggestionAccepter: SuggestionAccepter;
	suggestionEffects: SuggestionEffectService;
	transactionRunner: TransactionRunner;
	projectLister: { list(actor: ActorContext): Promise<readonly Project[]> };
	markdownToContent: typeof noteContentFromMarkdown;
	exportPreparer: typeof prepareExport;
	pdfGenerator: (input: PreparedExport) => Promise<Buffer>;
	noteActionRequests: NoteActionRequests;
	runSettlements: RunSettlement;
	runEvents: Pick<AgentEventBus, 'notify'>;
	promiseGeneration: SelectionGeneration;
	promiseRules: IPromiseRules;
}
export class Todos implements TodosController {
	async synchronize(
		actor: ActorContext,
		input: TodoMutationRequest
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(actor, input, target);
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(actor, input);
					return this.dependencies.syncMutations.complete(actor, input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(
		actor: ActorContext,
		input: TodoMutationRequest
	): Promise<void> {
		const command = input.command;

		switch (command.kind) {
			case 'createTodo':
				await this.create(actor, command);
				break;
			case 'updateTodo': {
				const { kind, ...edits } = command;
				void kind;
				await this.update(actor, edits);
				break;
			}
			case 'deleteTodo':
				await this.remove(actor, command.todoId);
				break;
		}
	}

	constructor(private readonly dependencies: TodosDependencies) {}
	async get(actor: ActorContext, input: GetTodoViewInput): Promise<TodoView> {
		const todo = await this.dependencies.todoReader.get(actor, input.todoId);
		const context = await this.dependencies.todoContextReader.readContext(actor, todo);
		const view = assembleTodoView(todo, context);
		return view;
	}
	async list(actor: ActorContext, filter: TodoListFilter): Promise<ListTodosOutput> {
		const todos = await this.dependencies.todoLister.list(actor, filter);
		const contexts = await this.dependencies.todoContextReader.readContexts(actor, todos);
		return { todos: contexts.map((context) => assembleTodoView(context.todo, context)) };
	}
	async count(actor: ActorContext, filter: TodoListFilter): Promise<number> {
		return this.dependencies.todoLister.count(actor, filter);
	}
	async listCategories(actor: ActorContext): Promise<readonly string[]> {
		return this.dependencies.todoLister.listCategories(actor);
	}
	async exportBoardPdf(actor: ActorContext, filter: TodoListFilter): Promise<BoardPdfExportResult> {
		const [todos, projects] = await Promise.all([
			this.dependencies.todoLister.list(actor, filter),
			this.dependencies.projectLister.list(actor)
		]);
		const contexts = await this.dependencies.todoContextReader.readContexts(actor, todos);
		const views = contexts.map((context) => assembleTodoView(context.todo, context));
		const projectNames = new Map(projects.map((project) => [project.id, project.name]));
		const generatedAt = new Date();
		const projectName = filter.projectId ? projectNames.get(filter.projectId) : undefined;
		const title = projectName ? `${projectName} todos` : 'Todos';
		const { document } = this.dependencies.markdownToContent(
			boardMarkdown(views, { title, generatedAt, projectNames })
		);
		const prepared = this.dependencies.exportPreparer({
			title,
			notes: [{ title, document }],
			settings: { ...defaultExportSettings, includeTitle: true }
		});
		const pdf = await this.dependencies.pdfGenerator(prepared);
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
		const todo = await this.dependencies.todoEditor.update(actor, input);
		const context = await this.dependencies.todoContextReader.readContext(actor, todo);
		const view = assembleTodoView(todo, context);
		return { todo, view };
	}
	createBatch(actor: ActorContext, input: CreateTodoBatchInput): Promise<CreateTodoBatchOutput> {
		return this.dependencies.transactionRunner.run(
			async () => {
				const previous = await this.dependencies.todoBatchReceipts.findForUpdate(actor, input);
				if (previous.kind === 'saved') return previous.result;
				const todos: Todo[] = [];
				for (const item of input.todos) {
					todos.push(
						await this.dependencies.todoCreator.create(actor, {
							...item,
							projectId: input.projectId
						})
					);
				}
				const result = { todos };
				await this.dependencies.todoBatchReceipts.save(actor, input, result);
				return result;
			},
			{ retry: 'database-only' }
		);
	}
	async remove(actor: ActorContext, todoId: TodoId): Promise<void> {
		await this.dependencies.todoReader.get(actor, todoId);
		await this.dependencies.todoDeleter.softDelete(actor, todoId);
	}
	async startExtractPromises(
		actor: ActorContext,
		input: StartExtractPromisesInput
	): Promise<AgentRunReceipt> {
		const request = {
			requestId: input.requestId,
			context: {
				kind: 'promise_extraction' as const,
				generation: this.dependencies.promiseGeneration,
				selection: input.selection,
				...(input.responsibility ? { responsibility: input.responsibility } : {})
			}
		};
		let receipt: AgentRunReceipt;
		try {
			receipt = await this.dependencies.transactionRunner.run(() =>
				this.dependencies.noteActionRequests.prepare(actor, request)
			);
		} catch (error) {
			if (!(error instanceof DuplicateNoteActionRequest)) throw error;
			receipt = await this.dependencies.noteActionRequests.existing(actor, request);
		}
		this.dependencies.runEvents.notify(receipt.runId);
		if (receipt.status === 'queued') this.launchPromiseRun(actor, receipt.runId);
		return receipt;
	}

	private launchPromiseRun(actor: ActorContext, runId: AgentRunId): void {
		// audit-allow: silent-catch — detached execution persists its terminal state; settlement failures are emitted for operational repair.
		void this.executePromiseRun(actor, runId).catch((error) =>
			console.error(`[promise-run] Could not settle ${runId}:`, error)
		);
	}

	async recoverQueuedPromiseRuns(): Promise<number> {
		const queued = await this.dependencies.noteActionRequests.queued('promise_extraction');
		for (const run of queued) this.launchPromiseRun(run.actor, run.runId);
		return queued.length;
	}

	async executePromiseRun(actor: ActorContext, runId: AgentRunId): Promise<void> {
		const run = await this.dependencies.transactionRunner.run(() =>
			this.dependencies.noteActionRequests.claim(actor, runId, 'promise_extraction')
		);
		if (!run) return;
		this.dependencies.runEvents.notify(runId);
		const active = registerActiveRun(runId);
		try {
			const input = run.contextSnapshot;
			await this.dependencies.selectionOrigins.validate(actor, input.selection);
			const candidates = await this.extractCandidates(
				actor,
				input,
				input.generation,
				run.createdAt,
				active.signal
			);
			active.signal.throwIfAborted();
			const saved = await this.dependencies.transactionRunner.run(async () => {
				const claim = await this.dependencies.runSettlements.claim(runId, {
					kind: 'completed',
					conversationId: run.conversationId,
					model: run.model
				});
				if (claim.kind === 'lost') return false;
				const result = await this.saveExtractedPromises(actor, input, candidates);
				await this.dependencies.noteActionRequests.recordResult(runId, {
					action: 'promises',
					result
				});
				await this.dependencies.runSettlements.complete(claim);
				return true;
			});
			if (saved) this.dependencies.runEvents.notify(runId);
			else await this.settlePromiseRun(runId, { kind: 'cancelled', message: 'Generation stopped' });
		} catch (error) {
			try {
				if (active.signal.aborted)
					await this.settlePromiseRun(runId, { kind: 'cancelled', message: 'Generation stopped' });
				else {
					const failed = await this.settlePromiseRun(runId, {
						kind: 'failed',
						code: 'WORKFLOW_FAILED',
						message: error instanceof Error ? error.message : String(error),
						retryable: true
					});
					if (!failed)
						await this.settlePromiseRun(runId, {
							kind: 'cancelled',
							message: 'Generation stopped'
						});
				}
			} catch (settlementError) {
				throw new AggregateError(
					[error, settlementError],
					'Promise extraction failed and could not be settled',
					{ cause: settlementError }
				);
			}
		} finally {
			releaseActiveRun(runId);
		}
	}

	private async settlePromiseRun(
		runId: AgentRunId,
		outcome: RunSettlementOutcome
	): Promise<boolean> {
		const settled = await this.dependencies.transactionRunner.run(async () => {
			const claim = await this.dependencies.runSettlements.claim(runId, outcome);
			if (claim.kind === 'lost') return false;
			await this.dependencies.runSettlements.complete(claim);
			return true;
		});
		if (settled) this.dependencies.runEvents.notify(runId);
		return settled;
	}
	async extractPromises(
		actor: ActorContext,
		input: ExtractPromisesInput,
		signal?: AbortSignal
	): Promise<ExtractPromisesOutput<TodoSuggestion>> {
		const requestedAt = new Date().toISOString() as DateTime;
		await this.dependencies.selectionOrigins.validate(actor, input.selection);
		const extracted = await this.extractCandidates(
			actor,
			input,
			this.dependencies.promiseGeneration,
			requestedAt,
			signal
		);
		signal?.throwIfAborted();
		return this.dependencies.transactionRunner.run(() =>
			this.saveExtractedPromises(actor, input, extracted)
		);
	}

	private extractCandidates(
		actor: ActorContext,
		input: ExtractPromisesInput,
		generation: SelectionGeneration,
		requestedAt: DateTime,
		signal?: AbortSignal
	): Promise<readonly PromiseCandidate[]> {
		return generation.kind === 'rules'
			? this.dependencies.promiseRules.extract(actor, input.selection, requestedAt)
			: this.dependencies.promiseExtractor.extract(
					actor,
					input.selection,
					{ model: generation.model, requestedAt },
					signal
				);
	}

	private async saveExtractedPromises(
		actor: ActorContext,
		input: ExtractPromisesInput,
		extracted: readonly PromiseCandidate[]
	): Promise<ExtractPromisesOutput<TodoSuggestion>> {
		const source = await this.dependencies.selectionOrigins.resolve(actor, input.selection);
		const { anchor } = source;
		const candidates = input.responsibility
			? extracted.filter((candidate) => candidate.responsibility === input.responsibility)
			: extracted;
		const origin = await this.dependencies.selectionOrigins.record(actor, source, {
			producerKind: 'pipeline',
			producerName: 'Extract Promises',
			pipeline: 'extract_promises',
			metadata: {}
		});
		const suggestions = [];
		const createdTodos: Todo[] = [];
		for (const candidate of candidates) {
			let suggestion = await this.dependencies.suggestionCreator.createFromSelection(
				actor,
				origin,
				{
					kind: 'todo',
					confidence: candidate.confidence,
					payload: {
						title: candidate.action,
						responsibility: candidate.responsibility,
						dueDateVerbatim: candidate.dueDateVerbatim,
						dueDate: candidate.resolvedDueDate,
						promiseStrength: candidate.strength
					}
				}
			);

			if (
				await this.dependencies.trustPolicyEvaluator.shouldAutoAccept(
					actor,
					'extract_promises',
					suggestion
				)
			) {
				const todo = await this.dependencies.todoCreator.create(actor, suggestion.payload);
				await this.dependencies.suggestionEffects.record(actor, suggestion.id, [
					{ kind: 'created', after: { type: 'todos', value: todo } }
				]);
				createdTodos.push(todo);
				const accepted = await this.dependencies.suggestionAccepter.accept(
					actor,
					suggestion,
					todo.id,
					true
				);
				if (accepted.kind !== 'todo')
					throw new InvalidTransitionError('Task acceptance returned a different suggestion kind');
				suggestion = accepted;
			}
			suggestions.push(suggestion);
		}
		return { anchorId: anchor.id, suggestions, createdTodos };
	}
}
