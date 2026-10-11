import { DuplicateNoteActionRequest } from '$lib/errors';
import type { NoteMarkdownReader } from '$lib/models/note-markdown';
import type { PdfRendering } from '$lib/server/services/deliverables/pdf';

import type { TodoCreationRules, TodoEditingRules } from '$lib/services/todos/edits';
import type { TodoPresentation } from '$lib/services/todos/presentation';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import { defaultExportSettings } from '$lib/models/deliverables';
import type { ActorContext } from '$lib/models/identity';
import type { Project } from '$lib/models/projects';
import type { TodoSuggestion } from '$lib/models/suggestions';
import type { TodoMutationRequest, WorkspaceMutationResult } from '$lib/models/workspace-mutations';
import type { SuggestionEffectService } from '$lib/server/services/suggestions/effects';
import type { TodoBatchReceiptService } from '$lib/server/services/todos/batch-receipts';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';
import type { TodoBoardExport } from '$lib/services/todos/board-export';

import {
	InvalidGeneratedContentError,
	InvalidTransitionError,
	NotFoundError,
	ValidationError
} from '$lib/errors';
import type {
	AgentRunId,
	AgentRunReceipt,
	RunSettlementOutcome,
	SelectionGeneration
} from '$lib/models/agent';
import type {
	BoardPdfExportResult,
	CreateTodoBatchInput,
	CreateTodoBatchOutput,
	CreateTodoInput,
	ExtractPromisesInput,
	ExtractPromisesOutput,
	GetTodoViewInput,
	ListTodosOutput,
	PromiseCandidate,
	StartExtractPromisesInput,
	Todo,
	TodoId,
	TodoListFilter,
	TodoView,
	UpdateTodoInput,
	UpdateTodoOutput
} from '$lib/models/todos';
import type { DateTime, AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import { type NoteActionSubmission } from '$lib/server/services/agent/runs/note-action-requests';
import type { RunSettlement } from '$lib/server/services/agent/runs/settlement';
import type { TrustPolicyEvaluator } from '$lib/server/services/agent/runs/tool-trust';
import type { SelectionOriginService } from '$lib/server/services/notes/selection-origin';
import type { SuggestionAccepter, SuggestionCreator } from '$lib/server/services/suggestions/inbox';
import type {
	TodoContextReader,
	TodoCreator,
	TodoDeleter,
	TodoEditor,
	TodoLister,
	TodoReader
} from '$lib/server/services/todos/catalog';
import type { PromiseExtractor } from '$lib/server/services/todos/promise-discovery';
import type { IPromiseRules } from '$lib/server/services/todos/promise-rules';
import type { RunSignals } from '$lib/server/services/agent/runs/signals';
import type { ExportPreparation } from '$lib/services/deliverables/export-preparation';

/**
 * Application boundary for todos: tracking, filtering, and the promise-extraction
 * pipeline that turns commitments in text into reviewable todo suggestions.
 */
export interface TodosController {
	synchronize(input: TodoMutationRequest): Promise<WorkspaceMutationResult>;
	/** Load a single todo as a view with its resolved display fields. */
	get(input: GetTodoViewInput): Promise<TodoView>;
	/** List todos by filter, each assembled into a view. */
	list(filter: TodoListFilter): Promise<ListTodosOutput>;
	/** Count todos matching a filter without loading them, for badges and pagination. */
	count(filter: TodoListFilter): Promise<number>;
	/** List the distinct category names in use, for filter dropdowns. */
	listCategories(): Promise<readonly string[]>;
	/** Render the board matching a filter as an ephemeral PDF download. */
	exportBoardPdf(filter: TodoListFilter): Promise<BoardPdfExportResult>;
	/** Create a todo. */
	create(input: CreateTodoInput): Promise<{ todo: Todo }>;
	/** Commit all tasks in input order; repeated requests return the saved outcome. */
	createBatch(input: CreateTodoBatchInput): Promise<CreateTodoBatchOutput>;
	/**
	 * Validate and persist the supplied fields and status as one complete edit.
	 *
	 * @throws InvalidGeneratedContentError if no edit is supplied at all — an update
	 * that changes nothing is a caller bug, not a no-op.
	 */
	update(input: UpdateTodoInput): Promise<UpdateTodoOutput>;
	/** Soft-delete a todo so it disappears from lists while its history survives. */
	remove(todoId: TodoId): Promise<void>;
	/**
	 * Extract commitments from a text selection and create one reviewable todo
	 * suggestion per candidate, in one transaction.
	 *
	 * Suggestions the trust policy deems safe are auto-accepted into real todos; the
	 * rest stay pending for review. Returns both the created suggestions and any todos
	 * auto-created from them.
	 */
	extractPromises(
		input: ExtractPromisesInput,
		signal?: AbortSignal
	): Promise<ExtractPromisesOutput<TodoSuggestion>>;
	/**
	 * Start {@link extractPromises} as a cancellable run, returning once the run is
	 * durable rather than once the extraction is done. Its result arrives as a
	 * `workflow_result` event, so a client that refreshes mid-run can still collect it.
	 */
	startExtractPromises(input: StartExtractPromisesInput): Promise<AgentRunReceipt>;
	executePromiseRun(runId: AgentRunId): Promise<void>;
	/** Start a queued run the previous process never started. */
	resumeQueuedPromiseRun(runId: AgentRunId): Promise<void>;
}
export interface TodosDependencies {
	readonly boardExport: TodoBoardExport;
	readonly todoPresentation: TodoPresentation;
	readonly todoEditingRules: TodoEditingRules;
	readonly todoCreationRules: TodoCreationRules;
	syncMutations: WorkspaceMutationGuard;
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
	todoBatchReceipts: TodoBatchReceiptService;
	suggestionAccepter: SuggestionAccepter;
	suggestionEffects: SuggestionEffectService;
	transactionRunner: TransactionRunner;
	projectLister: { list(): Promise<readonly Project[]> };
	markdownToContent: NoteMarkdownReader;
	exportPreparer: ExportPreparation;
	pdfGenerator: PdfRendering;
	noteActionRequests: NoteActionSubmission;
	runSettlements: RunSettlement;
	runSignals: RunSignals;
	promiseGeneration: SelectionGeneration;
	promiseRules: IPromiseRules;
}
export class Todos implements TodosController {
	async synchronize(input: TodoMutationRequest): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(input);
					return this.dependencies.syncMutations.complete(input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(input: TodoMutationRequest): Promise<void> {
		const command = input.command;

		switch (command.kind) {
			case 'createTodo':
				await this.create(command);
				break;
			case 'updateTodo': {
				const { kind, ...edits } = command;
				void kind;
				await this.update(edits);
				break;
			}
			case 'deleteTodo':
				await this.remove(command.todoId);
				break;
		}
	}

	constructor(
		private readonly actor: ActorContext,
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: TodosDependencies,
		private readonly clock: () => DateTime = () => new Date().toISOString() as DateTime
	) {}
	async get(input: GetTodoViewInput): Promise<TodoView> {
		const todo = await this.dependencies.todoReader.get(input.todoId);
		const context = await this.dependencies.todoContextReader.readContext(todo);
		const view = this.dependencies.todoPresentation.view(todo, context);
		return view;
	}
	async list(filter: TodoListFilter): Promise<ListTodosOutput> {
		const todos = await this.dependencies.todoLister.list(filter);
		const contexts = await this.dependencies.todoContextReader.readContexts(todos);
		return {
			todos: contexts.map((context) =>
				this.dependencies.todoPresentation.view(context.todo, context)
			)
		};
	}
	async count(filter: TodoListFilter): Promise<number> {
		return this.dependencies.todoLister.count(filter);
	}
	async listCategories(): Promise<readonly string[]> {
		return this.dependencies.todoLister.listCategories();
	}
	async exportBoardPdf(filter: TodoListFilter): Promise<BoardPdfExportResult> {
		const [todos, projects] = await Promise.all([
			this.dependencies.todoLister.list(filter),
			this.dependencies.projectLister.list()
		]);
		const projectNames = new Map(projects.map((project) => [project.id, project.name]));
		const projectName = filter.projectId ? projectNames.get(filter.projectId) : undefined;
		if (filter.projectId && projectName === undefined)
			throw new NotFoundError('Todo project was not found');
		const contexts = await this.dependencies.todoContextReader.readContexts(todos);
		const views = contexts.map((context) =>
			this.dependencies.todoPresentation.view(context.todo, context)
		);
		const generatedAt = new Date();
		const title = projectName !== undefined ? `${projectName} todos` : 'Todos';
		const board = this.dependencies.boardExport.prepare(
			views,
			{ title, generatedAt, projectNames },
			projectName ?? 'all',
			'pdf'
		);
		const { document } = this.dependencies.markdownToContent.read(board.markdown);
		const prepared = this.dependencies.exportPreparer.prepare({
			title,
			notes: [{ title, document }],
			settings: { ...defaultExportSettings, includeTitle: true }
		});
		const pdf = await this.dependencies.pdfGenerator.render(prepared);
		return {
			data: pdf.toString('base64'),
			filename: board.filename
		};
	}
	async create(input: CreateTodoInput): Promise<{ todo: Todo }> {
		const decision = this.dependencies.todoCreationRules.create(input, {
			id: input.id ?? (crypto.randomUUID() as TodoId),
			userId: this.actor.userId,
			timestamp: this.clock()
		});
		if (decision.kind === 'invalid') throw new ValidationError(decision.message);
		return { todo: await this.dependencies.todoCreator.create(decision.todo) };
	}
	async update(input: UpdateTodoInput): Promise<UpdateTodoOutput> {
		if (!this.dependencies.todoEditingRules.hasEdits(input)) {
			throw new InvalidGeneratedContentError('A todo update requires at least one edit');
		}
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.todoEditor.getForEdit(input.todoId);
			if (input.linkedNoteId) {
				await this.dependencies.todoEditor.validateLinkedNote(
					input.linkedNoteId,
					current.projectId
				);
			}
			const edited = this.dependencies.todoEditingRules.edit(current, input, this.clock());
			const todo = await this.dependencies.todoEditor.update(edited);
			const context = await this.dependencies.todoContextReader.readContext(todo);
			return { todo, view: this.dependencies.todoPresentation.view(todo, context) };
		});
	}
	createBatch(input: CreateTodoBatchInput): Promise<CreateTodoBatchOutput> {
		return this.dependencies.transactionRunner.run(
			async () => {
				const previous = await this.dependencies.todoBatchReceipts.findForUpdate(input);
				if (previous.kind === 'saved') return previous.result;
				const todos: Todo[] = [];
				for (const item of input.todos) {
					todos.push(
						(
							await this.create({
								...item,
								projectId: input.projectId
							})
						).todo
					);
				}
				const result = { todos };
				await this.dependencies.todoBatchReceipts.save(input, result);
				return result;
			},
			{ retry: 'database-only' }
		);
	}
	async remove(todoId: TodoId): Promise<void> {
		await this.dependencies.todoReader.get(todoId);
		await this.dependencies.todoDeleter.softDelete(todoId);
	}
	async startExtractPromises(input: StartExtractPromisesInput): Promise<AgentRunReceipt> {
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
				this.dependencies.noteActionRequests.prepare(request)
			);
		} catch (error) {
			if (!(error instanceof DuplicateNoteActionRequest)) throw error;
			receipt = await this.dependencies.noteActionRequests.existing(request);
		}
		if (receipt.status === 'queued') this.launchPromiseRun(receipt.runId);
		return receipt;
	}

	private launchPromiseRun(runId: AgentRunId): void {
		// audit-allow: silent-catch — detached execution persists its terminal state; settlement failures are emitted for operational repair.
		void this.executePromiseRun(runId).catch((error) =>
			console.error(`[promise-run] Could not settle ${runId}:`, error)
		);
	}

	async resumeQueuedPromiseRun(runId: AgentRunId): Promise<void> {
		this.launchPromiseRun(runId);
	}

	async executePromiseRun(runId: AgentRunId): Promise<void> {
		const run = await this.dependencies.transactionRunner.run(() =>
			this.dependencies.noteActionRequests.claim(runId, 'promise_extraction')
		);
		if (!run) return;
		const active = new AbortController();
		let stopWatching = async () => {};
		try {
			stopWatching = await this.dependencies.runSignals.abortOnCancel(runId, active);
			const input = run.contextSnapshot;
			await this.dependencies.selectionOrigins.validate(input.selection);
			const candidates = await this.extractCandidates(
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
				const result = await this.saveExtractedPromises(input, candidates);
				await this.dependencies.noteActionRequests.recordResult(runId, {
					action: 'promises',
					result
				});
				await this.dependencies.runSettlements.complete(claim);
				return true;
			});
			if (!saved)
				await this.settlePromiseRun(runId, { kind: 'cancelled', message: 'Generation stopped' });
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
			await stopWatching();
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
		return settled;
	}
	async extractPromises(
		input: ExtractPromisesInput,
		signal?: AbortSignal
	): Promise<ExtractPromisesOutput<TodoSuggestion>> {
		const requestedAt = new Date().toISOString() as DateTime;
		await this.dependencies.selectionOrigins.validate(input.selection);
		const extracted = await this.extractCandidates(
			input,
			this.dependencies.promiseGeneration,
			requestedAt,
			signal
		);
		signal?.throwIfAborted();
		return this.dependencies.transactionRunner.run(() =>
			this.saveExtractedPromises(input, extracted)
		);
	}

	private extractCandidates(
		input: ExtractPromisesInput,
		generation: SelectionGeneration,
		requestedAt: DateTime,
		signal?: AbortSignal
	): Promise<readonly PromiseCandidate[]> {
		return generation.kind === 'rules'
			? this.dependencies.promiseRules.extract(input.selection, requestedAt)
			: this.dependencies.promiseExtractor.extract(
					input.selection,
					{ model: generation.model, requestedAt },
					signal
				);
	}

	private async saveExtractedPromises(
		input: ExtractPromisesInput,
		extracted: readonly PromiseCandidate[]
	): Promise<ExtractPromisesOutput<TodoSuggestion>> {
		const source = await this.dependencies.selectionOrigins.resolve(input.selection);
		const { anchor } = source;
		const candidates = input.responsibility
			? this.dependencies.promiseRules.select(extracted, input.responsibility)
			: extracted;
		const origin = await this.dependencies.selectionOrigins.record(source, {
			producerKind: 'pipeline',
			producerName: 'Extract Promises',
			pipeline: 'extract_promises',
			metadata: {}
		});
		const suggestions = [];
		const createdTodos: Todo[] = [];
		for (const candidate of candidates) {
			let suggestion = await this.dependencies.suggestionCreator.createFromSelection(origin, {
				kind: 'todo',
				confidence: candidate.confidence,
				payload: {
					title: candidate.action,
					responsibility: candidate.responsibility,
					waitingOn: candidate.responsibility === 'waiting_on' ? candidate.ownerName : undefined,
					dueDateVerbatim: candidate.dueDateVerbatim,
					dueDate: candidate.resolvedDueDate,
					promiseStrength: candidate.strength
				}
			});

			if (
				await this.dependencies.trustPolicyEvaluator.shouldAutoAccept(
					'extract_promises',
					suggestion
				)
			) {
				const { todo } = await this.create(suggestion.payload);
				await this.dependencies.suggestionEffects.record(suggestion.id, [
					{ kind: 'created', after: { type: 'todos', value: todo } }
				]);
				createdTodos.push(todo);
				const accepted = await this.dependencies.suggestionAccepter.accept(
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
