import { describe, expect, it } from 'vitest';
import { SuggestionInbox } from './inbox';
import { ExpiringSuggestionLister } from './expiring-lister';
import { InMemorySuggestionRepository } from '$lib/testing/fakes/in-memory-suggestion-repository';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/fakes/in-memory-provenance-repository';
import {
	anchorBuilder,
	noteBuilder,
	suggestionBuilder,
	testActor,
	testNow,
	testProvenanceId,
	testSuggestionId
} from '$lib/testing/fixtures/domain-builders';

const setup = () => {
	const suggestions = new InMemorySuggestionRepository();
	const notes = new InMemoryNoteRepository();
	const anchors = new InMemoryAnchorRepository();
	const provenance = new InMemoryProvenanceRepository();
	notes.notes = [noteBuilder()];
	anchors.anchors = [anchorBuilder()];
	provenance.provenance = [
		{
			id: testProvenanceId(),
			userId: testActor().userId,
			producerKind: 'pipeline',
			producerName: 'Test',
			metadata: {},
			createdAt: testNow
		}
	];
	const service = new SuggestionInbox(suggestions, notes, provenance, anchors, {
		now: () => testNow
	});
	return { service, suggestions, anchors };
};

describe('Suggestion management invariants', () => {
	it('rejects a proposal whose anchor belongs to another note', async () => {
		const { service, anchors } = setup();
		anchors.anchors = [anchorBuilder({ noteId: '00000000-0000-4000-0003-000000000002' as never })];
		await expect(
			service.create(testActor(), {
				kind: 'todo',
				noteId: noteBuilder().id,
				sourceAnchorId: anchorBuilder().id,
				provenanceId: testProvenanceId(),
				payload: { projectId: noteBuilder().projectId, title: 'Task', responsibility: 'mine' }
			})
		).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
	});
	it('rejects a todo proposal scoped to another project', async () => {
		const { service } = setup();
		await expect(
			service.create(testActor(), {
				kind: 'todo',
				noteId: noteBuilder().id,
				provenanceId: testProvenanceId(),
				payload: {
					projectId: '00000000-0000-4000-0002-000000000002' as never,
					title: 'Task',
					responsibility: 'mine'
				}
			})
		).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
	});
	it('accepts a pending suggestion atomically', async () => {
		const { service, suggestions } = setup();
		suggestions.suggestions = [suggestionBuilder()];
		const accepted = await service.accept(
			testActor(),
			suggestionBuilder(),
			'00000000-0000-4000-0005-000000000001',
			false
		);
		expect(accepted.status).toBe('accepted');
	});
	it('cannot apply the same terminal transition twice', async () => {
		const { service, suggestions } = setup();
		const proposed = suggestionBuilder();
		suggestions.suggestions = [proposed];
		await service.accept(testActor(), proposed, '00000000-0000-4000-0005-000000000001', false);
		await expect(
			service.accept(testActor(), proposed, '00000000-0000-4000-0005-000000000001', false)
		).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
	});
	it('cannot revert a rejected suggestion', async () => {
		const { service, suggestions } = setup();
		const rejected = suggestionBuilder({ status: 'rejected' });
		suggestions.suggestions = [rejected];
		await expect(service.revert(testActor(), rejected)).rejects.toMatchObject({
			code: 'INVALID_TRANSITION'
		});
	});
	it('cannot accept an expired suggestion', async () => {
		const { service, suggestions } = setup();
		const expired = suggestionBuilder({ expiresAt: '2026-07-10T09:00:00.000Z' as never });
		suggestions.suggestions = [expired];
		await expect(
			service.accept(testActor(), expired, '00000000-0000-4000-0005-000000000001', false)
		).rejects.toMatchObject({ code: 'EXPIRED_SUGGESTION' });
	});
	it('expires only eligible proposed suggestions', async () => {
		const { service, suggestions } = setup();
		suggestions.suggestions = [
			suggestionBuilder({ expiresAt: '2026-07-10T09:00:00.000Z' as never }),
			suggestionBuilder({
				id: testSuggestionId(2),
				status: 'accepted',
				expiresAt: '2026-07-10T09:00:00.000Z' as never
			})
		];
		expect(await service.expire(testActor())).toBe(1);
	});
	it('expires stale proposals before listing active proposals', async () => {
		const { service, suggestions } = setup();
		suggestions.suggestions = [
			suggestionBuilder({ expiresAt: '2026-07-10T09:00:00.000Z' as never })
		];
		const active = await new ExpiringSuggestionLister(service, service).listByStatus(
			testActor(),
			'proposed'
		);
		expect(active).toEqual([]);
	});
});
