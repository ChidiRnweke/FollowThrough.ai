import { describe, expect, it } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import type { Provenance } from '$lib/models/provenance';
import type { ProposeMemoryChangeInput } from '$lib/models/memory';
import { ValidationError } from '$lib/errors';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import { MemoryLibrary } from '$lib/server/services/memory/library';
import { Memory } from './controller';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemoryTrustPolicyEvaluator } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { EmbeddedMemoryIndexer } from '$lib/server/services/knowledge-search/indexing';
import {
	projectBuilder,
	testActor,
	testNow,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';

class RecordingProvenanceRecorder implements ProvenanceRecorder {
	records: Provenance[] = [];
	constructor(private readonly repository: InMemoryProvenanceRepository) {}

	async record(
		actor: ActorContext,
		input: Omit<Provenance, 'id' | 'userId' | 'createdAt'>
	): Promise<Provenance> {
		const provenance: Provenance = {
			id: testProvenanceId(this.records.length + 1),
			userId: actor.userId,
			...input,
			createdAt: testNow
		};
		this.records.push(provenance);
		return this.repository.insert(actor, provenance);
	}
}

const addInput = (overrides: Partial<ProposeMemoryChangeInput> = {}): ProposeMemoryChangeInput => ({
	scope: 'project',
	projectId: testProjectId(),
	operation: 'add',
	content: 'The team ships on Tuesdays.',
	confidence: 90,
	...overrides
});

const setup = () => {
	const entries = new InMemoryMemoryEntryRepository();
	const projects = new InMemoryProjectRepository();
	const provenanceRepository = new InMemoryProvenanceRepository();
	const provenance = new RecordingProvenanceRecorder(provenanceRepository);
	const suggestions = new InMemorySuggestions();
	const trust = new InMemoryTrustPolicyEvaluator();
	projects.projects = [projectBuilder()];
	const memory = new MemoryLibrary(
		entries,
		projects,
		provenanceRepository,
		new EmbeddedMemoryIndexer(new InMemorySearchRepository(), new InMemoryEmbeddingClient())
	);
	const controller = new Memory({
		memoryLister: memory,
		memoryCreator: memory,
		memoryEditor: memory,
		memoryDeleter: memory,
		memoryChangeApplier: memory,
		provenanceRecorder: provenance,
		suggestionCreator: suggestions,
		suggestionAccepter: suggestions,
		trustPolicyEvaluator: trust,
		transactionRunner: new InMemoryTransactionRunner([entries, suggestions])
	});
	return { entries, provenance, suggestions, trust, controller };
};

describe('Memory proposal orchestration invariants', () => {
	it('creates a memory suggestion for review', async () => {
		const { controller } = setup();
		const result = await controller.propose(testActor(), addInput());
		expect(result.suggestion.kind).toBe('memory');
	});

	it('records agent provenance on the memory pipeline', async () => {
		const { provenance, controller } = setup();
		await controller.propose(testActor(), addInput());
		expect(provenance.records[0]?.pipeline).toBe('memory');
	});

	it('leaves the entry uncreated without an authorizing trust policy', async () => {
		const { entries, controller } = setup();
		await controller.propose(testActor(), addInput());
		expect(entries.entries).toEqual([]);
	});

	it('applies the entry when the memory pipeline is trusted', async () => {
		const { entries, trust, controller } = setup();
		trust.autoAccept = true;
		await controller.propose(testActor(), addInput());
		expect(entries.entries).toHaveLength(1);
	});

	it('marks an auto-applied suggestion as auto-accepted', async () => {
		const { trust, controller } = setup();
		trust.autoAccept = true;
		const result = await controller.propose(testActor(), addInput());
		expect(result.suggestion.isAutoAccepted).toBe(true);
	});

	it('links an auto-accepted suggestion to the created entry', async () => {
		const { trust, controller } = setup();
		trust.autoAccept = true;
		const result = await controller.propose(testActor(), addInput());
		expect(result.suggestion.appliedArtifactId).toBe(result.appliedEntry?.id);
	});

	it('keeps a user-scoped proposal free of any project', async () => {
		const { controller } = setup();
		const result = await controller.propose(
			testActor(),
			addInput({ scope: 'user', projectId: undefined, content: 'I lead the platform team.' })
		);
		expect(
			result.suggestion.kind === 'memory' ? result.suggestion.payload.projectId : 'wrong-kind'
		).toBeUndefined();
	});

	it('creates a profile entry when a trusted user-scoped proposal is applied', async () => {
		const { entries, trust, controller } = setup();
		trust.autoAccept = true;
		await controller.propose(
			testActor(),
			addInput({ scope: 'user', projectId: undefined, content: 'I lead the platform team.' })
		);
		expect(entries.entries[0]?.projectId).toBeUndefined();
	});

	it('drops the project from a user-scoped proposal that carries one', async () => {
		const { controller } = setup();
		const result = await controller.propose(testActor(), addInput({ scope: 'user' }));
		expect(
			result.suggestion.kind === 'memory' ? result.suggestion.payload.projectId : 'wrong-kind'
		).toBeUndefined();
	});

	it('rejects a project-scoped proposal without a project', async () => {
		const { controller } = setup();
		await expect(
			controller.propose(testActor(), addInput({ projectId: undefined }))
		).rejects.toBeInstanceOf(ValidationError);
	});

	it('rejects an update proposal without a target entry', async () => {
		const { controller } = setup();
		await expect(
			controller.propose(testActor(), addInput({ operation: 'update' }))
		).rejects.toBeInstanceOf(ValidationError);
	});

	it('rejects an add proposal without content', async () => {
		const { controller } = setup();
		await expect(
			controller.propose(testActor(), addInput({ content: '  ' }))
		).rejects.toBeInstanceOf(ValidationError);
	});
});

describe('Memory proposal transaction invariants', () => {
	it('rolls back an applied entry when suggestion acceptance fails', async () => {
		const { entries, suggestions, trust, controller } = setup();
		trust.autoAccept = true;
		suggestions.failAcceptance = true;
		try {
			await controller.propose(testActor(), addInput());
		} catch {
			// The restored entry collection is the invariant under test.
		}
		expect(entries.entries).toEqual([]);
	});
});
