import { describe, expect, it } from 'vitest';
import { SelectionOrigins } from './selection-origin';
import { SuggestionInbox } from '$lib/server/services/suggestions/inbox';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemorySuggestionRepository } from '$lib/testing/suggestions/fakes/in-memory-suggestion-repository';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
const setup = () => {
	const notes = new InMemoryNoteRepository();
	notes.notes = [noteBuilder({ plainText: 'Do the work.' })];
	const anchors = new InMemoryAnchorRepository();
	const provenance = new InMemoryProvenanceRepository();
	return { notes, anchors, provenance, service: new SelectionOrigins(notes, anchors, provenance) };
};
const selection = { noteId: testNoteId(), revision: 1, from: 0, to: 12, text: 'Do the work.' };
describe('Selection origins', () => {
	it('rejects selection offsets outside the note', async () => {
		const { service } = setup();
		await expect(service.resolve(testActor(), { ...selection, to: 99 })).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
	it('records provenance for the resolved source anchor', async () => {
		const { service } = setup();
		const source = await service.resolve(testActor(), selection);
		const origin = await service.record(testActor(), source, {
			producerKind: 'user',
			producerName: 'Create Skill From Selection',
			metadata: {}
		});
		expect({
			noteId: origin.anchor.noteId,
			sourceAnchorId: origin.provenance.sourceAnchorId
		}).toEqual({ noteId: origin.note.id, sourceAnchorId: source.anchor.id });
	});
	it('refuses a stale selection before storing an anchor', async () => {
		const { service, anchors } = setup();
		await service.resolve(testActor(), { ...selection, revision: 2 }).catch(() => undefined);
		expect(anchors.anchors).toEqual([]);
	});
	it('refuses text that does not match the selected range', async () => {
		const { service } = setup();
		await expect(
			service.resolve(testActor(), { ...selection, text: 'Wrong quote.' })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('uses one source identity for the task proposal envelope and payload', async () => {
		const { service, notes, anchors, provenance } = setup();
		const source = await service.resolve(testActor(), selection);
		const origin = await service.record(testActor(), source, {
			producerKind: 'pipeline',
			producerName: 'Extract Promises',
			pipeline: 'extract_promises',
			metadata: {}
		});
		const inbox = new SuggestionInbox(
			new InMemorySuggestionRepository(),
			notes,
			provenance,
			anchors
		);
		const suggestion = await inbox.createFromSelection(testActor(), origin, {
			kind: 'todo',
			payload: { title: 'Do the work', responsibility: 'mine' }
		});
		expect({
			kind: suggestion.kind,
			noteId: suggestion.noteId,
			sourceAnchorId: suggestion.sourceAnchorId,
			provenanceId: suggestion.provenanceId,
			payload: suggestion.payload
		}).toEqual({
			kind: 'todo',
			noteId: source.note.id,
			sourceAnchorId: source.anchor.id,
			provenanceId: origin.provenance.id,
			payload: {
				title: 'Do the work',
				responsibility: 'mine',
				projectId: source.note.projectId,
				sourceAnchorId: source.anchor.id,
				provenanceId: origin.provenance.id
			}
		});
	});
});
