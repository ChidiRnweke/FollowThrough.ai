import {
	memoryEntryBuilder,
	testMemoryEntryId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import type { MemoryChangePayload } from '$lib/models/memory';
import type { Provenance } from '$lib/models/provenance';
import { NotFoundError } from '$lib/errors';
import { MemoryLibrary } from './library';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
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
	const service = new MemoryLibrary(entries, projects, provenance);
	return { entries, projects, provenance, service };
};

const addPayload = (): Extract<MemoryChangePayload, { scope: 'project'; operation: 'add' }> => ({
	scope: 'project',
	projectId: testProjectId(),
	operation: 'add',
	content: 'Deploys go out on Tuesdays.'
});

describe('Memory entry management invariants', () => {
	it('rejects a memory entry for an unknown project', async () => {
		const { service } = await setup();
		await expect(
			service.create(
				testActor(),
				memoryEntryBuilder({
					id: testMemoryEntryId(1),
					projectId: testProjectId(99),
					content: 'Fact'
				})
			)
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('hides a removed entry from the project list', async () => {
		const { service } = await setup();
		const entry = await service.create(
			testActor(),
			memoryEntryBuilder({ id: testMemoryEntryId(2), projectId: testProjectId(), content: 'Fact' })
		);
		await service.remove(testActor(), entry.id);
		expect(await service.list(testActor(), { projectId: testProjectId() })).toEqual([]);
	});
});

describe('User profile memory invariants', () => {
	it('creates a profile entry without any project', async () => {
		const { service } = await setup();
		const entry = await service.create(
			testActor(),
			memoryEntryBuilder({
				id: testMemoryEntryId(3),
				projectId: undefined,
				content: 'I lead the platform team.'
			})
		);
		expect(entry.projectId).toBeUndefined();
	});

	it('lists profile entries without project entries', async () => {
		const { service } = await setup();
		await service.create(
			testActor(),
			memoryEntryBuilder({
				id: testMemoryEntryId(4),
				projectId: testProjectId(),
				content: 'Project fact'
			})
		);
		const profile = await service.create(
			testActor(),
			memoryEntryBuilder({
				id: testMemoryEntryId(5),
				projectId: undefined,
				content: 'I prefer short answers.'
			})
		);
		expect((await service.list(testActor(), {})).map((item) => item.id)).toEqual([profile.id]);
	});

	it('lists project entries without profile entries', async () => {
		const { service } = await setup();
		const project = await service.create(
			testActor(),
			memoryEntryBuilder({
				id: testMemoryEntryId(6),
				projectId: testProjectId(),
				content: 'Project fact'
			})
		);
		await service.create(
			testActor(),
			memoryEntryBuilder({
				id: testMemoryEntryId(7),
				projectId: undefined,
				content: 'I prefer short answers.'
			})
		);
		expect(
			(await service.list(testActor(), { projectId: testProjectId() })).map((item) => item.id)
		).toEqual([project.id]);
	});

	it('applies a user-scoped add as a profile entry', async () => {
		const { service } = await setup();
		const { entry } = await service.apply(
			testActor(),
			{ scope: 'user', operation: 'add', content: 'I am the founder.' },
			testProvenanceId()
		);
		expect(entry.projectId).toBeUndefined();
	});
});

describe('Memory change application invariants', () => {
	it.each(['update', 'remove'] as const)(
		'rejects a profile %s against project memory before writing',
		async (operation) => {
			const { service, entries } = await setup();
			const { entry } = await service.apply(testActor(), addPayload(), testProvenanceId());
			const payload: MemoryChangePayload =
				operation === 'update'
					? { scope: 'user', operation, memoryEntryId: entry.id, content: 'Replacement' }
					: { scope: 'user', operation, memoryEntryId: entry.id };
			const outcome = await service.apply(testActor(), payload, testProvenanceId()).then(
				() => 'unexpected success',
				(error: Error) => error.message
			);
			expect({ outcome, entries: entries.entries }).toEqual({
				outcome: 'Memory target does not belong to the requested scope',
				entries: [entry]
			});
		}
	);
	it('rejects a project replacement targeting profile memory', async () => {
		const { service } = await setup();
		const target = await service.create(
			testActor(),
			memoryEntryBuilder({
				id: testMemoryEntryId(8),
				projectId: undefined,
				content: 'Profile fact'
			})
		);
		await expect(
			service.apply(
				testActor(),
				{
					scope: 'project',
					projectId: testProjectId(),
					operation: 'update',
					memoryEntryId: target.id,
					content: 'Replacement'
				},
				testProvenanceId()
			)
		).rejects.toThrow('Memory target does not belong to the requested scope');
	});
	it('rejects an apply with unknown provenance', async () => {
		const { service } = await setup();
		await expect(
			service.apply(testActor(), addPayload(), testProvenanceId(99))
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('creates an entry with provenance on add', async () => {
		const { service } = await setup();
		const { entry } = await service.apply(testActor(), addPayload(), testProvenanceId());
		expect(entry.provenanceId).toBe(testProvenanceId());
	});

	it('links an update replacement to the entry it supersedes', async () => {
		const { service } = await setup();
		const { entry: original } = await service.apply(testActor(), addPayload(), testProvenanceId());
		const { entry: replacement } = await service.apply(
			testActor(),
			{
				scope: 'project',
				projectId: testProjectId(),
				operation: 'update',
				memoryEntryId: original.id,
				content: 'Revised fact'
			},
			testProvenanceId()
		);
		expect(replacement.replacesEntryId).toBe(original.id);
	});

	it('supersedes the target entry on update', async () => {
		const { service } = await setup();
		const { entry: original } = await service.apply(testActor(), addPayload(), testProvenanceId());
		await service.apply(
			testActor(),
			{
				scope: 'project',
				projectId: testProjectId(),
				operation: 'update',
				memoryEntryId: original.id,
				content: 'Revised fact'
			},
			testProvenanceId()
		);
		expect((await service.get(testActor(), original.id)).deletedAt).toBeDefined();
	});

	it('rejects an update against a superseded entry', async () => {
		const { service } = await setup();
		const { entry: original } = await service.apply(testActor(), addPayload(), testProvenanceId());
		await service.apply(
			testActor(),
			{
				scope: 'project',
				projectId: testProjectId(),
				operation: 'remove',
				memoryEntryId: original.id
			},
			testProvenanceId()
		);
		await expect(
			service.apply(
				testActor(),
				{
					scope: 'project',
					projectId: testProjectId(),
					operation: 'update',
					memoryEntryId: original.id,
					content: 'Too late'
				},
				testProvenanceId()
			)
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('soft-deletes the target on remove', async () => {
		const { service } = await setup();
		const { entry: original } = await service.apply(testActor(), addPayload(), testProvenanceId());
		await service.apply(
			testActor(),
			{
				scope: 'project',
				projectId: testProjectId(),
				operation: 'remove',
				memoryEntryId: original.id
			},
			testProvenanceId()
		);
		expect(await service.list(testActor(), { projectId: testProjectId() })).toEqual([]);
	});
});

describe('Memory application effects', () => {
	it('records both sides of a memory replacement', async () => {
		const { service } = await setup();
		const { entry: original } = await service.apply(testActor(), addPayload(), testProvenanceId());
		const result = await service.apply(
			testActor(),
			{
				scope: 'project',
				projectId: testProjectId(),
				operation: 'update',
				memoryEntryId: original.id,
				content: 'Revised fact'
			},
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
		const { entry: original } = await service.apply(testActor(), addPayload(), testProvenanceId());
		const result = await service.apply(
			testActor(),
			{
				scope: 'project',
				projectId: testProjectId(),
				operation: 'remove',
				memoryEntryId: original.id
			},
			testProvenanceId()
		);
		expect(result.changes).toEqual([{ kind: 'modified', before: original, after: result.entry }]);
	});
});
