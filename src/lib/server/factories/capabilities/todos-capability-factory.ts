import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { TodoCatalog } from '$lib/server/services/todos/catalog';
import { TodoBatchReceipts } from '$lib/server/services/todos/batch-receipts';
import { TodoBatchReceiptRecords } from '$lib/server/repositories/todos/postgres/batch-receipts';
import { PromiseDiscovery } from '$lib/server/services/todos/promise-discovery';
import { PromiseClassification } from '$lib/server/repositories/todos/classification';
import { DEFAULT_PROMISE_MODEL } from '$lib/models/todos';
import type { SelectionGeneration } from '$lib/models/agent';
import { DeterministicPromiseExtractor } from '$lib/server/services/todos/promise-rules';
import { operationObserver } from '$lib/server/services/telemetry';

export interface TodosCapabilityInput {
	readonly db: Database;
	readonly projects: ProjectRepository;
	readonly notes: NoteRepository;
	readonly anchors: SourceAnchorRepository;
	readonly provenance: ProvenanceRepository;
}

export interface TodosCapability {
	readonly catalog: TodoCatalog;
	readonly batchReceipts: TodoBatchReceipts;
	readonly promiseExtractor: PromiseDiscovery;
	readonly promiseRules: DeterministicPromiseExtractor;
	readonly promiseGeneration: SelectionGeneration;
}

export const createTodosCapability = (input: TodosCapabilityInput): TodosCapability => ({
	batchReceipts: new TodoBatchReceipts(new TodoBatchReceiptRecords(input.db)),
	catalog: new TodoCatalog(
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
			observer: operationObserver
		})
	)
});
