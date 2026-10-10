import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import {
	memoryEntryBuilder,
	testMemoryEntryId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemorySuggestionEffects } from '$lib/testing/suggestions/fakes/in-memory-suggestion-effects';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import type { MemoryDependencies } from './controller';
import { describe, expect, it } from 'vitest';
import type { ProposeMemoryChangeInput } from '$lib/models/memory';
import { ValidationError } from '$lib/errors';
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
import {
	projectBuilder,
	testActor,
	testProjectId,
	testProvenanceId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

type ProjectAddition = Extract<ProposeMemoryChangeInput, { scope: 'project'; operation: 'add' }>;
const addInput = (overrides: Partial<ProjectAddition> = {}): ProjectAddition => ({
	provenanceId: testProvenanceId(),
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
	provenanceRepository.provenance = [
		{
			id: testProvenanceId(),
			userId: testActor().userId,
			producerKind: 'agent',
			producerName: 'MCP client',
			pipeline: 'agent',
			metadata: { scope: 'full' },
			createdAt: testNow
		}
	];
	const suggestions = new InMemorySuggestions();
	const effects = new InMemorySuggestionEffects();
	const trust = new InMemoryTrustPolicyEvaluator();
	projects.projects = [projectBuilder()];
	const search = new InMemorySearchRepository();
	const indexEmbeddings = new InMemoryEmbeddingClient();
	const indexWriter = createContentIndex(search, indexEmbeddings.model);
	const memory = new MemoryLibrary(entries, projects, provenanceRepository);
	const controller = new Memory(
		capabilityDependencies<MemoryDependencies>({
			memoryLister: memory,
			memoryIndexer: indexWriter.memories,
			indexEmbeddings,
			indexWriter,
			memoryCreator: memory,
			memoryEditor: memory,
			memoryDeleter: memory,
			memoryChanges: memory,
			suggestionCreator: suggestions,
			suggestionAccepter: suggestions,
			suggestionEffects: effects,
			trustPolicyEvaluator: trust,
			transactionRunner: new InMemoryTransactionRunner([entries, search, suggestions, effects])
		})
	);
	return {
		entries,
		provenance: provenanceRepository,
		suggestions,
		trust,
		controller,
		search,
		memory,
		projects
	};
};

describe('Memory proposal orchestration invariants', () => {
	it('records provenance for a reviewable proposal without creating the entry', async () => {
		const { entries, controller } = setup();
		const result = await controller.propose(testActor(), addInput());
		expect({
			kind: result.suggestion.kind,
			provenanceId: result.suggestion.provenanceId,
			entries: entries.entries
		}).toEqual({ kind: 'memory', provenanceId: testProvenanceId(), entries: [] });
	});

	it('applies and links a trusted suggestion to its entry', async () => {
		const { entries, trust, controller } = setup();
		trust.autoAccept = true;
		const result = await controller.propose(testActor(), addInput());
		expect({
			entryCount: entries.entries.length,
			accepted: result.suggestion.isAutoAccepted,
			appliedArtifactId: result.suggestion.appliedArtifactId,
			entryId: result.appliedEntry?.id
		}).toEqual({
			entryCount: 1,
			accepted: true,
			appliedArtifactId: entries.entries[0]?.id,
			entryId: entries.entries[0]?.id
		});
	});

	it('creates a profile entry when a trusted user-scoped proposal is applied', async () => {
		const { entries, trust, controller } = setup();
		trust.autoAccept = true;
		await controller.propose(testActor(), {
			provenanceId: testProvenanceId(),
			scope: 'user',
			operation: 'add',
			content: 'I lead the platform team.'
		});
		expect(entries.entries[0]?.projectId).toBeUndefined();
	});

	it('rejects a profile proposal targeting project memory before recording a suggestion', async () => {
		const { controller, memory, suggestions } = setup();
		const target = await memory.create(
			testActor(),
			memoryEntryBuilder({
				id: testMemoryEntryId(1),
				projectId: testProjectId(),
				content: 'Existing fact'
			})
		);
		const outcome = await controller
			.propose(testActor(), {
				provenanceId: testProvenanceId(),
				scope: 'user',
				operation: 'remove',
				memoryEntryId: target.id
			})
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
		const target = await memory.create(
			testActor(),
			memoryEntryBuilder({
				id: testMemoryEntryId(2),
				projectId: testProjectId(2),
				content: 'Existing fact'
			})
		);
		await expect(
			controller.propose(testActor(), {
				provenanceId: testProvenanceId(),
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
