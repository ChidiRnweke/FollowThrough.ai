import { describe, expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import { NoteRevealStore } from './note-reveal.svelte';

const noteId = 'note-1' as NoteId;

const request = {
	noteId,
	start: 4,
	end: 8,
	text: 'ship',
	others: [{ start: 20, end: 24, text: 'ship' }]
};

describe('NoteRevealStore', () => {
	it('carries the note’s other matches alongside the clicked one', () => {
		const store = new NoteRevealStore();
		store.request(request);
		expect(store.consume(noteId)?.others).toEqual([{ start: 20, end: 24, text: 'ship' }]);
	});

	it('fires a reveal exactly once', () => {
		const store = new NoteRevealStore();
		store.request(request);
		store.consume(noteId);
		expect(store.consume(noteId)).toBeUndefined();
	});

	it('preserves the complete request after a different note attempts to consume it', () => {
		const store = new NoteRevealStore();
		store.request(request);
		const otherNote = store.consume('note-2' as NoteId);
		const matchingNote = store.consume(noteId);
		expect({ otherNote, matchingNote }).toEqual({
			otherNote: undefined,
			matchingNote: { ...request, requestedAt: expect.any(Number) }
		});
	});
});
