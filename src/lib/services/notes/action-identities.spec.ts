import { expect, it } from 'vitest';
import { NoteActionIdentityService } from './action-identities';
import type { TextSelection, SelectionSubmission } from '$lib/models/notes';
import type { DiagramActionSubmission } from '$lib/models/diagrams';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
const firstId = '00000000-0000-4000-8000-000000000001';
const nextId = '00000000-0000-4000-8000-000000000002';
const selection: TextSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 1,
	to: 4,
	text: 'Send'
};
it.each<Partial<TextSelection>>([
	{ noteId: testNoteId(2) },
	{ revision: 2 },
	{ from: 0 },
	{ to: 5 },
	{ text: 'Post' }
])('requires a new identity when any selected fact changes: %j', (change) => {
	const saved: SelectionSubmission = { requestId: firstId, selection };
	const candidate: SelectionSubmission = {
		requestId: nextId,
		selection: { ...selection, ...change }
	};
	expect(new NoteActionIdentityService().selection([saved], candidate).requestId).toBe(nextId);
});
it('does not reuse a diagram revision after a rendered preview was added', () => {
	const saved: DiagramActionSubmission = {
		operation: 'revise',
		requestId: firstId,
		noteId: testNoteId(),
		source: 'flowchart LR\nA --> B',
		instruction: 'Improve spacing'
	};
	const candidate: DiagramActionSubmission = {
		...saved,
		requestId: nextId,
		renderedPngDataUrl:
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pfsAAAAASUVORK5CYII='
	};
	expect(new NoteActionIdentityService().diagram([saved], candidate).requestId).toBe(nextId);
});
