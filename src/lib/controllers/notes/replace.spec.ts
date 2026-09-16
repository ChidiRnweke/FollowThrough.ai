import { describe, expect, it } from 'vitest';
import { replaceNoteDrafts } from './replace';
import { InMemoryReplacementDraft } from '$lib/testing/notes/fakes/in-memory-replacement-draft';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new Map(
		[1, 2, 3].map((index) => {
			const note = noteBuilder({
				id: testNoteId(index),
				title: `Note ${index}`,
				plainText: 'ship release',
				document: {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ship release' }] }]
				}
			});
			return [note.id, note];
		})
	);
	const drafts = [...notes.keys()].map((id) => new InMemoryReplacementDraft(notes, id));
	return { notes, drafts };
};
const input = { query: 'ship', replacement: 'deploy', regex: false, caseSensitive: false };

describe('durable local note replacements', () => {
	it('reports the saved notes and remaining work when the second local write fails', async () => {
		const { drafts } = setup();
		drafts[1]!.failSave = true;
		expect(await replaceNoteDrafts(drafts, input)).toEqual({
			kind: 'failure',
			saved: [{ noteId: testNoteId(1), title: 'Note 1', matches: 1 }],
			failed: { noteId: testNoteId(2), title: 'Note 2', message: 'Device storage is full' },
			unattempted: [testNoteId(3)]
		});
	});
	it('keeps the first durable write and leaves failed and unattempted notes unchanged', async () => {
		const { notes, drafts } = setup();
		drafts[1]!.failSave = true;
		await replaceNoteDrafts(drafts, input);
		expect([...notes.values()].map((note) => note.plainText)).toEqual([
			'deploy release',
			'ship release',
			'ship release'
		]);
	});
	it('captures all selected notes before writing any replacement', async () => {
		const { notes, drafts } = setup();
		notes.delete(testNoteId(2));
		await replaceNoteDrafts(drafts, input).catch(() => undefined);
		expect([...notes.values()].map((note) => note.plainText)).toEqual([
			'ship release',
			'ship release'
		]);
	});
	it('reports every saved replacement on success', async () => {
		const { drafts } = setup();
		expect(await replaceNoteDrafts(drafts, input)).toEqual({
			kind: 'complete',
			saved: [1, 2, 3].map((id) => ({ noteId: testNoteId(id), title: `Note ${id}`, matches: 1 }))
		});
	});
});
