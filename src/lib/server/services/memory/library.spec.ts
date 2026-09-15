import { describe, expect, it } from 'vitest';
import type { MemoryChangePayload } from '$lib/models/memory';
import type { Provenance } from '$lib/models/provenance';
import { NotFoundError, ValidationError } from '$lib/errors';
import { MemoryLibrary } from './library';
import { EmbeddedMemoryIndexer } from '$lib/server/services/knowledge-search/indexing';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import {
	projectBuilder,
	testActor,
	testNow,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';

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
	const service = new MemoryLibrary(
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

describe('User profile memory invariants', () => {
	it('creates a profile entry without any project', async () => {
		const { service } = await setup();
		const entry = await service.create(testActor(), { content: 'I lead the platform team.' });
		expect(entry.projectId).toBeUndefined();
	});

	it('keeps profile entries out of the retrieval index', async () => {
		const { search, service } = await setup();
		await service.create(testActor(), { content: 'I lead the platform team.' });
		expect(search.documents).toEqual([]);
	});

	it('lists profile entries without project entries', async () => {
		const { service } = await setup();
		await service.create(testActor(), { projectId: testProjectId(), content: 'Project fact' });
		const profile = await service.create(testActor(), { content: 'I prefer short answers.' });
		expect((await service.list(testActor(), {})).map((item) => item.id)).toEqual([profile.id]);
	});

	it('lists project entries without profile entries', async () => {
		const { service } = await setup();
		const project = await service.create(testActor(), {
			projectId: testProjectId(),
			content: 'Project fact'
		});
		await service.create(testActor(), { content: 'I prefer short answers.' });
		expect(
			(await service.list(testActor(), { projectId: testProjectId() })).map((item) => item.id)
		).toEqual([project.id]);
	});

	it('applies a user-scoped add as a profile entry', async () => {
		const { service } = await setup();
		const entry = await service.apply(
			testActor(),
			{ operation: 'add', content: 'I am the founder.' },
			testProvenanceId()
		);
		expect(entry.projectId).toBeUndefined();
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

describe('Memory application effects', () => {
	it('records both sides of a memory replacement', async () => {
		const { service } = await setup();
		const original = await service.apply(testActor(), addPayload(), testProvenanceId());
		const result = await service.applyWithChange(
			testActor(),
			addPayload({ operation: 'update', memoryEntryId: original.id, content: 'Revised fact' }),
			testProvenanceId()
		);
		expect(result.changes).toEqual([
			{
				kind: 'modified',
				before: original,
				after: expect.objectContaining({ id: original.id, deletedAt: expect.any(String) })
			},
			{ kind: 'created', after: result.entry }
		]);
	});
	it('records the original entry before removing it', async () => {
		const { service } = await setup();
		const original = await service.apply(testActor(), addPayload(), testProvenanceId());
		const result = await service.applyWithChange(
			testActor(),
			addPayload({ operation: 'remove', memoryEntryId: original.id }),
			testProvenanceId()
		);
		expect(result.changes).toEqual([{ kind: 'modified', before: original, after: result.entry }]);
	});
});
