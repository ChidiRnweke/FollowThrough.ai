import { expect, it } from 'vitest';
import { NoteWriting } from './writing';
import { InMemoryNoteWriting } from '$lib/testing/notes/fakes/in-memory-writing';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
const request = {
	noteId: testNoteId(),
	revision: 3,
	prefix: 'Write',
	suffix: '',
	headingPath: [],
	currentSection: 'Write',
	blockType: 'paragraph'
};
it('discards a completion when the caret request was aborted while waiting', async () => {
	const transport = new InMemoryNoteWriting();
	let finish!: () => void;
	transport.pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const abort = new AbortController();
	const completion = new NoteWriting(transport).suggest(request, abort.signal);
	abort.abort();
	finish();
	expect(await completion).toEqual({ text: '' });
});
it('propagates an unavailable provider instead of reporting an empty successful response', async () => {
	const transport = new InMemoryNoteWriting();
	transport.failure = new Error('Unavailable');
	await expect(
		new NoteWriting(transport).suggest(request, new AbortController().signal)
	).rejects.toThrow('Unavailable');
});
it('returns the suggested text for the active caret request', async () => {
	expect(
		await new NoteWriting(new InMemoryNoteWriting()).suggest(request, new AbortController().signal)
	).toEqual({ text: ' next words' });
});
