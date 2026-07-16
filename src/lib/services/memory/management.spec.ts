import { describe, expect, it } from 'vitest';
import type { MemoryChangePayload, MemorySuggestion, Provenance } from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/models';
import { MemoryManagementService } from './management';
import { EmbeddedMemoryIndexer } from '$lib/services/retrieval/indexing';
import { InMemoryMemoryEntryRepository } from '$lib/testing/fakes/in-memory-memory-repository';
import { InMemoryProjectRepository } from '$lib/testing/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/fakes/in-memory-provenance-repository';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/fakes/in-memory-search';
import {
	projectBuilder,
	testActor,
	testNow,
	testProjectId,
	testProvenanceId,
	testSuggestionId
} from '$lib/testing/fixtures/domain-builders';

const setup = async () => {
	const entries = new InMemoryMemoryEntryRepository();
	const projects = new InMemoryProjectRepository();
	const provenance = new InMemoryProvenanceRepository();
	const search = new InMemorySearchRepository();
	projects.projects = [projectBuilder()];
	const record: Provenance = {
		id: testProvenanceId(),
		userId: testActor().userId,
		producerKind: 'agent',
		producerName: 'Agent memory',
		pipeline: 'memory',
		metadata: {},
		createdAt: testNow
	};
	await provenance.insert(testActor(), record);
	const service = new MemoryManagementService(
		entries,
		projects,
		provenance,
		new EmbeddedMemoryIndexer(search, new InMemoryEmbeddingClient())
	);
	return { entries, projects, provenance, search, service };
};

const addPayload = (overrides: Partial<MemoryChangePayload> = {}): MemoryChangePayload => ({
	projectId: testProjectId(),
	operation: 'add',
	content: 'Deploys go out on Tuesdays.',
	...overrides
});

const memorySuggestion = (
	payload: MemoryChangePayload,
	appliedArtifactId: string
): MemorySuggestion => ({
	id: testSuggestionId(),
	userId: testActor().userId,
	kind: 'memory',
	status: 'accepted',
	payload,
	provenanceId: testProvenanceId(),
	appliedArtifactId,
	isAutoAccepted: false,
	createdAt: testNow,
	updatedAt: testNow
});

describe('Memory entry management invariants', () => {
	it('rejects a memory entry for an unknown project', async () => {
		const { service } = await setup();
		await expect(
			service.create(testActor(), { projectId: testProjectId(99), content: 'Fact' })
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('rejects an empty memory entry', async () => {
		const { service } = await setup();
		await expect(
			service.create(testActor(), { projectId: testProjectId(), content: '   ' })
		).rejects.toBeInstanceOf(ValidationError);
	});

	it('indexes a shared entry into search chunks', async () => {
		const { search, service } = await setup();
		await service.create(testActor(), { projectId: testProjectId(), content: 'Fact' });
		expect(search.documents).toHaveLength(1);
	});

	it('marks memory-sourced chunks with the entry id', async () => {
		const { search, service } = await setup();
		const entry = await service.create(testActor(), {
			projectId: testProjectId(),
			content: 'Fact'
		});
		expect(search.documents[0]?.document.memoryEntryId).toBe(entry.id);
	});

	it('does not index an entry withheld from agents', async () => {
		const { search, service } = await setup();
		await service.create(testActor(), {
			projectId: testProjectId(),
			content: 'Fact',
			shareWithAgents: false
		});
		expect(search.documents).toEqual([]);
	});

	it('removes chunks when sharing is switched off', async () => {
		const { search, service } = await setup();
		const entry = await service.create(testActor(), {
			projectId: testProjectId(),
			content: 'Fact'
		});
		await service.update(testActor(), { memoryEntryId: entry.id, shareWithAgents: false });
		expect(search.documents).toEqual([]);
	});

	it('reindexes edited content', async () => {
		const { search, service } = await setup();
		const entry = await service.create(testActor(), {
			projectId: testProjectId(),
			content: 'Old fact'
		});
		await service.update(testActor(), { memoryEntryId: entry.id, content: 'New fact' });
		expect(search.documents[0]?.document.content).toBe('New fact');
	});

	it('hides a removed entry from the project list', async () => {
		const { service } = await setup();
		const entry = await service.create(testActor(), {
			projectId: testProjectId(),
			content: 'Fact'
		});
		await service.remove(testActor(), entry.id);
		expect(await service.list(testActor(), { projectId: testProjectId() })).toEqual([]);
	});

	it('removes chunks when an entry is removed', async () => {
		const { search, service } = await setup();
		const entry = await service.create(testActor(), {
			projectId: testProjectId(),
			content: 'Fact'
		});
		await service.remove(testActor(), entry.id);
		expect(search.documents).toEqual([]);
	});
});

describe('Memory change application invariants', () => {
	it('rejects an apply with unknown provenance', async () => {
		const { service } = await setup();
		await expect(
			service.apply(testActor(), addPayload(), testProvenanceId(99))
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('creates an entry with provenance on add', async () => {
		const { service } = await setup();
		const entry = await service.apply(testActor(), addPayload(), testProvenanceId());
		expect(entry.provenanceId).toBe(testProvenanceId());
	});

	it('links an update replacement to the entry it supersedes', async () => {
		const { service } = await setup();
		const original = await service.apply(testActor(), addPayload(), testProvenanceId());
		const replacement = await service.apply(
			testActor(),
			addPayload({ operation: 'update', memoryEntryId: original.id, content: 'Revised fact' }),
			testProvenanceId()
		);
		expect(replacement.replacesEntryId).toBe(original.id);
	});

	it('supersedes the target entry on update', async () => {
		const { service } = await setup();
		const original = await service.apply(testActor(), addPayload(), testProvenanceId());
		await service.apply(
			testActor(),
			addPayload({ operation: 'update', memoryEntryId: original.id, content: 'Revised fact' }),
			testProvenanceId()
		);
		expect((await service.get(testActor(), original.id)).deletedAt).toBeDefined();
	});

	it('keeps only the replacement chunks after an update', async () => {
		const { search, service } = await setup();
		const original = await service.apply(testActor(), addPayload(), testProvenanceId());
		const replacement = await service.apply(
			testActor(),
			addPayload({ operation: 'update', memoryEntryId: original.id, content: 'Revised fact' }),
			testProvenanceId()
		);
		expect(search.documents.map((item) => item.document.memoryEntryId)).toEqual([replacement.id]);
	});

	it('rejects an update against a superseded entry', async () => {
		const { service } = await setup();
		const original = await service.apply(testActor(), addPayload(), testProvenanceId());
		await service.apply(
			testActor(),
			addPayload({ operation: 'remove', memoryEntryId: original.id, content: undefined }),
			testProvenanceId()
		);
		await expect(
			service.apply(
				testActor(),
				addPayload({ operation: 'update', memoryEntryId: original.id, content: 'Too late' }),
				testProvenanceId()
			)
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('soft-deletes the target on remove', async () => {
		const { service } = await setup();
		const original = await service.apply(testActor(), addPayload(), testProvenanceId());
		await service.apply(
			testActor(),
			addPayload({ operation: 'remove', memoryEntryId: original.id, content: undefined }),
			testProvenanceId()
		);
		expect(await service.list(testActor(), { projectId: testProjectId() })).toEqual([]);
	});
});

describe('Memory change revert invariants', () => {
	it('withdraws an added entry on revert', async () => {
		const { service } = await setup();
		const entry = await service.apply(testActor(), addPayload(), testProvenanceId());
		await service.revert(testActor(), memorySuggestion(addPayload(), entry.id));
		expect(await service.list(testActor(), { projectId: testProjectId() })).toEqual([]);
	});

	it('restores the superseded entry when an update is reverted', async () => {
		const { service } = await setup();
		const original = await service.apply(testActor(), addPayload(), testProvenanceId());
		const updatePayload = addPayload({
			operation: 'update',
			memoryEntryId: original.id,
			content: 'Revised fact'
		});
		const replacement = await service.apply(testActor(), updatePayload, testProvenanceId());
		await service.revert(testActor(), memorySuggestion(updatePayload, replacement.id));
		expect(
			(await service.list(testActor(), { projectId: testProjectId() })).map((item) => item.id)
		).toEqual([original.id]);
	});

	it('reindexes the restored entry when an update is reverted', async () => {
		const { search, service } = await setup();
		const original = await service.apply(testActor(), addPayload(), testProvenanceId());
		const updatePayload = addPayload({
			operation: 'update',
			memoryEntryId: original.id,
			content: 'Revised fact'
		});
		const replacement = await service.apply(testActor(), updatePayload, testProvenanceId());
		await service.revert(testActor(), memorySuggestion(updatePayload, replacement.id));
		expect(search.documents.map((item) => item.document.memoryEntryId)).toEqual([original.id]);
	});

	it('restores a removed entry on revert', async () => {
		const { service } = await setup();
		const original = await service.apply(testActor(), addPayload(), testProvenanceId());
		const removePayload = addPayload({
			operation: 'remove',
			memoryEntryId: original.id,
			content: undefined
		});
		await service.apply(testActor(), removePayload, testProvenanceId());
		await service.revert(testActor(), memorySuggestion(removePayload, original.id));
		expect(
			(await service.list(testActor(), { projectId: testProjectId() })).map((item) => item.id)
		).toEqual([original.id]);
	});
});
