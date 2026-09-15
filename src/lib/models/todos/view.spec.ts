import { expect, it } from 'vitest';
import { assembleTodoView } from './index';
import {
	anchorBuilder,
	noteBuilder,
	testNoteId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';

it('shows the linked note while preserving the extraction origin', () => {
	const origin = noteBuilder({ id: testNoteId(1), title: 'Meeting' });
	const linked = noteBuilder({ id: testNoteId(2), title: 'Work plan' });
	const anchor = anchorBuilder({ noteId: origin.id });
	const todo = todoBuilder({ sourceAnchorId: anchor.id, linkedNoteId: linked.id });
	const view = assembleTodoView(todo, { origin, linked, anchor, provenance: null });
	expect({ source: view.sourceNote, origin: view.originNote }).toEqual({
		source: { id: linked.id, title: linked.title },
		origin: { id: origin.id, title: origin.title }
	});
});

it('uses the extraction origin when the linked note is absent', () => {
	const origin = noteBuilder();
	const anchor = anchorBuilder({ noteId: origin.id });
	const todo = todoBuilder({ sourceAnchorId: anchor.id, linkedNoteId: testNoteId(2) });
	expect(
		assembleTodoView(todo, { origin, linked: null, anchor, provenance: null }).sourceNote
	).toEqual({ id: origin.id, title: origin.title });
});
