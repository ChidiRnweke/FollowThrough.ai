import { expect, it } from 'vitest';
import { noteEtag, noteMatchesEtag } from './presentation';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

it('identifies the note and its saved revision in the publish token', () => {
	const note = noteBuilder({ currentRevision: 3 });
	expect(noteEtag(note)).toBe(`note:${note.id}:r3`);
});

it.each([noteBuilder({ currentRevision: 2 }), noteBuilder({ id: testNoteId(2) })])(
	'rejects a publish token from a different note or revision',
	(note) => {
		expect(noteMatchesEtag(note, noteEtag(noteBuilder()))).toBe(false);
	}
);
