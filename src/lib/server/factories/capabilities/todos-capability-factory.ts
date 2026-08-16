import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { TodoCatalog } from '$lib/server/services/todos/catalog';
import { PromiseDiscovery } from '$lib/server/services/todos/promise-discovery';
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
	readonly promiseExtractor: PromiseDiscovery;
}

export const createTodosCapability = (input: TodosCapabilityInput): TodosCapability => ({
	catalog: new TodoCatalog(
		new TodoRecords(input.db),
		input.projects,
		input.anchors,
		input.notes,
		input.provenance
	),
	promiseExtractor: new PromiseDiscovery({
		fallback: new DeterministicPromiseExtractor(),
		observer: operationObserver
	})
});
