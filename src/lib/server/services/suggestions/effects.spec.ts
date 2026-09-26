import { describe, expect, it } from 'vitest';
import { SuggestionEffects } from './effects';
import { InMemoryApplicationEffects } from '$lib/testing/suggestions/fakes/in-memory-application-effects';
import {
	memoryEntryBuilder,
	memorySuggestionBuilder,
	testNoteId,
	testProjectId,
	testProvenanceId,
	suggestionBuilder,
	testActor,
	testNow,
	testMemoryEntryId,
	testSuggestionId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { BacklinkSuggestion } from '$lib/models/suggestions';
import type { RelationshipId } from '$lib/models/relationships';
import type { AppliedRecord } from '$lib/server/repositories/suggestions/application-effects';

const accepted = () =>
	suggestionBuilder({
		status: 'accepted',
		appliedArtifactId: todoBuilder().id,
		decidedAt: testNow
	});
const relationship = (): Extract<AppliedRecord, { type: 'note_relationships' }> => ({
	type: 'note_relationships',
	value: {
		id: '00000000-0000-4000-8000-000000000231' as RelationshipId,
		userId: testActor().userId,
		sourceNoteId: testNoteId(),
		targetNoteId: testNoteId(2),
		kind: 'elaborates',
		justification: 'Original',
		createdAt: testNow,
		updatedAt: testNow
	}
});
const acceptedBacklink = (justification = 'Suggested'): BacklinkSuggestion => ({
	...accepted(),
	status: 'accepted',
	decidedAt: testNow,
	kind: 'backlink',
	appliedArtifactId: relationship().value.id,
	payload: {
		sourceNoteId: testNoteId(),
		targetNoteId: testNoteId(2),
		kind: 'elaborates',
		justification
	}
});
const acceptedMemory = (operation: 'update' | 'remove') =>
	memorySuggestionBuilder({
		status: 'accepted',
		payload:
			operation === 'update'
				? {
						scope: 'project',
						projectId: testProjectId(),
						operation,
						memoryEntryId: testMemoryEntryId(),
						content: 'Revised'
					}
				: {
						scope: 'project',
						projectId: testProjectId(),
						operation,
						memoryEntryId: testMemoryEntryId()
					},
		appliedArtifactId: operation === 'update' ? testMemoryEntryId(2) : testMemoryEntryId()
	});
const setup = () => {
	const repository = new InMemoryApplicationEffects();
	return { repository, service: new SuggestionEffects(repository) };
};
const replacement = async () => {
	const context = setup();
	const before: AppliedRecord = { type: 'memory_entries', value: memoryEntryBuilder() };
	const deleted: AppliedRecord = {
		type: 'memory_entries',
		value: { ...before.value, deletedAt: testNow }
	};
	const created: AppliedRecord = {
		type: 'memory_entries',
		value: memoryEntryBuilder({
			id: testMemoryEntryId(2),
			content: 'Revised',
			provenanceId: testProvenanceId(),
			replacesEntryId: before.value.id
		})
	};
	context.repository.put(deleted);
	context.repository.put(created);
	await context.service.record(testActor(), testSuggestionId(), [
		{ kind: 'modified', before, after: deleted },
		{ kind: 'created', after: created }
	]);
	return { ...context, before, created, deleted };
};
describe('Recorded proposal undo', () => {
	it('refuses automatic undo for an accepted proposal without a recorded effect', async () => {
		const { service } = setup();
		await expect(service.restore(testActor(), accepted())).rejects.toThrow(
			'its changes were not recorded'
		);
	});
	it('withdraws a newly created record', async () => {
		const { service, repository } = setup();
		const after: AppliedRecord = { type: 'todos', value: todoBuilder() };
		repository.put(after);
		await service.record(testActor(), testSuggestionId(), [{ kind: 'created', after }]);
		const result = await service.restore(testActor(), accepted());
		expect(result).toEqual([
			{ type: 'todos', value: expect.objectContaining({ deletedAt: expect.any(String) }) }
		]);
	});
	it('restores the previous justification of an existing relationship', async () => {
		const { service, repository } = setup();
		const before = relationship();
		const after: AppliedRecord = {
			type: 'note_relationships',
			value: { ...before.value, justification: 'Suggested' }
		};
		repository.put(after);
		await service.record(testActor(), testSuggestionId(), [{ kind: 'modified', before, after }]);
		expect(await service.restore(testActor(), acceptedBacklink())).toEqual([before]);
	});
	it('leaves an unchanged participant alone after later edits', async () => {
		const { service, repository } = setup();
		const after = relationship();
		repository.put(after);
		await service.record(testActor(), testSuggestionId(), [{ kind: 'unchanged', after }]);
		repository.put({
			type: 'note_relationships',
			value: { ...after.value, justification: 'Later edit' }
		});
		await service.restore(testActor(), acceptedBacklink('Original'));
		expect(repository.records.get(`note_relationships:${after.value.id}`)?.value).toMatchObject({
			justification: 'Later edit'
		});
	});
	it('restores the superseded memory and withdraws its replacement together', async () => {
		const { service, before, created } = await replacement();
		expect(await service.restore(testActor(), acceptedMemory('update'))).toEqual([
			{
				type: 'memory_entries',
				value: expect.objectContaining({ id: created.value.id, deletedAt: expect.any(String) })
			},
			before
		]);
	});
	it('refuses to overwrite an intervening edit', async () => {
		const { service, repository, created } = await replacement();
		repository.put(created);
		await expect(service.restore(testActor(), acceptedMemory('update'))).rejects.toThrow(
			'its saved data has changed'
		);
	});
	it('does not partially reverse a replacement when either record changed', async () => {
		const { service, repository, created, deleted } = await replacement();
		repository.put(created);
		const failure = await service.restore(testActor(), acceptedMemory('update')).then(
			() => null,
			(error) => error
		);
		expect({ failed: failure !== null, records: [...repository.records.values()] }).toEqual({
			failed: true,
			records: [deleted, created]
		});
	});
	it('restores a removed memory from its recorded preimage', async () => {
		const { service, repository } = setup();
		const before: AppliedRecord = { type: 'memory_entries', value: memoryEntryBuilder() };
		const after: AppliedRecord = {
			type: 'memory_entries',
			value: { ...before.value, deletedAt: testNow }
		};
		repository.put(after);
		await service.record(testActor(), testSuggestionId(), [{ kind: 'modified', before, after }]);
		expect(await service.restore(testActor(), acceptedMemory('remove'))).toEqual([before]);
	});
});
