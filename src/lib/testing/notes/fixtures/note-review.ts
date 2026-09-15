import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import type { NoteChangeReview } from '$lib/models/notes';

export const noteReviewBuilder = (): Extract<NoteChangeReview, { kind: 'prepared' }> => {
	const note = noteBuilder({
		title: 'Release',
		plainText: 'Monday',
		document: {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Monday' }] }]
		}
	});
	return {
		kind: 'prepared',
		change: {
			noteId: note.id,
			base: { revision: note.currentRevision, title: note.title, document: note.document },
			result: {
				document: {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tuesday' }] }]
				},
				plainText: 'Tuesday'
			},
			operation: { kind: 'replace' }
		}
	};
};
