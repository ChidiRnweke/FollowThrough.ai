import type { SearchMatch } from '$lib/models/knowledge-search';
import type { NoteId } from '$lib/models/notes';
import type { LinkCandidate, RelatedNoteMatch } from '$lib/models/relationships';

/** Classify the strongest passage from each other note, preserving retrieval order. */
export function relatedNoteMatches(
	source: NoteId,
	matches: readonly SearchMatch[]
): readonly RelatedNoteMatch[] {
	const unique = new Map<NoteId, RelatedNoteMatch>();
	for (const match of matches) {
		const noteId = match.document.noteId;
		if (!noteId || noteId === source) continue;
		const previous = unique.get(noteId);
		if (!previous || match.score > previous.score)
			unique.set(noteId, { noteId, content: match.document.content, score: match.score });
	}
	// Preserve the existing five-proposal presentation for Relate selection.
	return [...unique.values()].slice(0, 5);
}

export function relatedNoteCandidate(
	match: RelatedNoteMatch,
	classification: Omit<LinkCandidate, 'targetNoteId'>
): LinkCandidate {
	return {
		targetNoteId: match.noteId,
		...classification,
		confidence: Math.round(
			(Math.max(0, Math.min(100, classification.confidence)) +
				Math.max(0, Math.min(1, match.score)) * 100) /
				2
		)
	};
}
