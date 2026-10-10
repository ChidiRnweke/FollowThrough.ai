import { TodoBoardExportService, type TodoBoardExport } from '$lib/services/todos/board-export';
import {
	TodoEditingRulesService,
	type TodoCreationRules,
	type TodoEditingRules
} from '$lib/services/todos/edits';
import { TodoPresentationService, type TodoPresentation } from '$lib/services/todos/presentation';
import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import {
	TodoCreationService,
	TodoReadingService,
	TodoEditingService,
	TodoLifecycleService,
	TodoContextService,
	type TodoCreator,
	type TodoReader,
	type TodoEditor,
	type TodoDeleter,
	type TodoLister,
	type WaitingOnFinder,
	type TodoContextReader
} from '$lib/server/services/todos/catalog';
import type { TodoRepository } from '$lib/server/repositories/todos/todos';
import type { DateTime } from '$lib/models/workspace';
import {
	TodoBatchReceipts,
	type TodoBatchReceiptService
} from '$lib/server/services/todos/batch-receipts';
import { TodoBatchReceiptRecords } from '$lib/server/repositories/todos/postgres/batch-receipts';
import {
	PromiseDiscovery,
	type PromiseExtractor
} from '$lib/server/services/todos/promise-discovery';
import { PromiseClassification } from '$lib/server/repositories/todos/classification';
import { DEFAULT_PROMISE_MODEL } from '$lib/models/todos';
import type { SelectionGeneration } from '$lib/models/agent';
import {
	DeterministicPromiseExtractor,
	type IPromiseRules
} from '$lib/server/services/todos/promise-rules';
import { createTelemetryCapability } from '$lib/server/factories/telemetry';

export interface TodosCapabilityInput {
	readonly db: Database;
	readonly projects: ProjectRepository;
	readonly notes: NoteRepository;
	readonly anchors: SourceAnchorRepository;
	readonly provenance: ProvenanceRepository;
}

export interface TodosCapability {
	readonly boardExport: TodoBoardExport;
	readonly creationRules: TodoCreationRules;
	readonly editingRules: TodoEditingRules;
	readonly presentation: TodoPresentation;
	readonly services: TodoServices;
	readonly batchReceipts: TodoBatchReceiptService;
	readonly promiseExtractor: PromiseExtractor;
	readonly promiseRules: IPromiseRules;
	readonly promiseGeneration: SelectionGeneration;
}

export const createTodosCapability = (input: TodosCapabilityInput): TodosCapability => ({
	boardExport: new TodoBoardExportService(),
	creationRules: new TodoEditingRulesService(),
	editingRules: new TodoEditingRulesService(),
	presentation: new TodoPresentationService(),
	batchReceipts: new TodoBatchReceipts(new TodoBatchReceiptRecords(input.db)),
	services: createTodoServices(
		new TodoRecords(input.db),
		input.projects,
		input.anchors,
		input.notes,
		input.provenance
	),
	promiseRules: new DeterministicPromiseExtractor(),
	promiseGeneration: process.env.OPENROUTER_API_KEY
		? { kind: 'model', model: DEFAULT_PROMISE_MODEL }
		: { kind: 'rules' },
	promiseExtractor: new PromiseDiscovery(
		new PromiseClassification(process.env.OPENROUTER_API_KEY, {
			baseURL: process.env.OPENROUTER_BASE_URL,
			appURL: process.env.ORIGIN,
			observer: createTelemetryCapability().operations
		})
	)
});

export interface TodoServices {
	readonly creator: TodoCreator;
	readonly reader: TodoReader;
	readonly editor: TodoEditor;
	readonly deleter: TodoDeleter;
	readonly lister: TodoLister;
	readonly waitingOn: WaitingOnFinder;
	readonly context: TodoContextReader;
}
export const createTodoServices = (
	todos: TodoRepository,
	projects: ProjectRepository,
	anchors: SourceAnchorRepository,
	notes: NoteRepository,
	provenance: ProvenanceRepository,
	clock: () => DateTime = () => new Date().toISOString() as DateTime
): TodoServices => {
	const reading = new TodoReadingService(todos);
	return {
		creator: new TodoCreationService(todos, projects, anchors, notes, provenance),
		reader: reading,
		lister: reading,
		waitingOn: reading,
		editor: new TodoEditingService(todos, anchors, notes, provenance),
		deleter: new TodoLifecycleService(todos, clock),
		context: new TodoContextService(anchors, notes, provenance)
	};
};
