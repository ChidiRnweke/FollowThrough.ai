import { InMemorySuggestionEffects } from '$lib/testing/suggestions/fakes/in-memory-suggestion-effects';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import type { MemoryDependencies } from './controller';
import { describe, expect, it } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import { asProvenance, type Provenance, type ProvenanceRequest } from '$lib/models/provenance';
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
import { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
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

	async record(actor: ActorContext, input: ProvenanceRequest): Promise<Provenance> {
		const provenance = asProvenance(input, {
			id: testProvenanceId(this.records.length + 1),
			userId: actor.userId,
			createdAt: testNow
		});
		this.records.push(provenance);
		return this.repository.insert(actor, provenance);
	}
}

type ProjectAddition = Extract<ProposeMemoryChangeInput, { scope: 'project'; operation: 'add' }>;
const addInput = (overrides: Partial<ProjectAddition> = {}): ProjectAddition => ({
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
	const effects = new InMemorySuggestionEffects();
	const trust = new InMemoryTrustPolicyEvaluator();
	projects.projects = [projectBuilder()];
	const search = new InMemorySearchRepository();
	const memoryIndexer = new ContentIndex(search, new InMemoryEmbeddingClient()).memories;
	const memory = new MemoryLibrary(entries, projects, provenanceRepository);
	const controller = new Memory(
		capabilityDependencies<MemoryDependencies>({
			memoryLister: memory,
			memoryIndexer,
			memoryCreator: memory,
			memoryEditor: memory,
			memoryDeleter: memory,
			memoryChanges: memory,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			suggestionAccepter: suggestions,
			suggestionEffects: effects,
			trustPolicyEvaluator: trust,
			transactionRunner: new InMemoryTransactionRunner([entries, search, suggestions, effects])
		})
	);
	return { entries, provenance, suggestions, trust, controller, search, memory, projects };
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
		expect(provenance.records[0]).toMatchObject({ pipeline: 'memory' });
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
		const result = await controller.propose(testActor(), {
			scope: 'user',
			operation: 'add',
			content: 'I lead the platform team.'
		});
		expect(
			result.suggestion.kind === 'memory' ? result.suggestion.payload.projectId : 'wrong-kind'
		).toBeUndefined();
	});

	it('creates a profile entry when a trusted user-scoped proposal is applied', async () => {
		const { entries, trust, controller } = setup();
		trust.autoAccept = true;
		await controller.propose(testActor(), {
			scope: 'user',
			operation: 'add',
			content: 'I lead the platform team.'
		});
		expect(entries.entries[0]?.projectId).toBeUndefined();
	});

	it('rejects a profile proposal targeting project memory before recording a suggestion', async () => {
		const { controller, memory, suggestions } = setup();
		const target = await memory.create(testActor(), {
			projectId: testProjectId(),
			content: 'Existing fact'
		});
		const outcome = await controller
			.propose(testActor(), { scope: 'user', operation: 'remove', memoryEntryId: target.id })
			.then(
				() => ({ kind: 'success' }),
				() => ({ kind: 'failure' })
			);
		expect({ outcome, suggestions: suggestions.suggestions }).toEqual({
			outcome: { kind: 'failure' },
			suggestions: []
		});
	});
	it('rejects a project proposal targeting another project', async () => {
		const { controller, memory, projects } = setup();
		projects.projects.push(projectBuilder({ id: testProjectId(2) }));
		const target = await memory.create(testActor(), {
			projectId: testProjectId(2),
			content: 'Existing fact'
		});
		await expect(
			controller.propose(testActor(), {
				scope: 'project',
				projectId: testProjectId(),
				operation: 'update',
				memoryEntryId: target.id,
				content: 'Wrong scope'
			})
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

describe('Memory proposal search updates', () => {
	it('keeps only replacement chunks after a trusted update', async () => {
		const { controller, trust, search } = setup();
		trust.autoAccept = true;
		const original = await controller.propose(testActor(), addInput());
		if (!original.appliedEntry) throw new Error('Trusted addition must produce a memory');
		const replacement = await controller.propose(testActor(), {
			...addInput(),
			operation: 'update',
			memoryEntryId: original.appliedEntry.id,
			content: 'Revised fact'
		});
		expect(search.documents.map((item) => item.document.memoryEntryId)).toEqual([
			replacement.appliedEntry?.id
		]);
	});
});
