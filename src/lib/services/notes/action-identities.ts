import type { SelectionSubmission } from '$lib/models/notes';
import type { DiagramActionSubmission } from '$lib/models/diagrams';
export interface NoteActionIdentities {
	selection(
		saved: readonly SelectionSubmission[],
		candidate: SelectionSubmission
	): SelectionSubmission;
	diagram(
		saved: readonly DiagramActionSubmission[],
		candidate: DiagramActionSubmission
	): DiagramActionSubmission;
}
/** Uncertain submissions keep their identity only when the complete normalized intent agrees. */
export class NoteActionIdentityService implements NoteActionIdentities {
	selection(
		saved: readonly SelectionSubmission[],
		candidate: SelectionSubmission
	): SelectionSubmission {
		const selection = candidate.selection;
		return (
			saved.find(
				({ selection: previous }) =>
					previous.noteId === selection.noteId &&
					previous.revision === selection.revision &&
					previous.from === selection.from &&
					previous.to === selection.to &&
					previous.text === selection.text
			) ?? candidate
		);
	}
	diagram(
		saved: readonly DiagramActionSubmission[],
		candidate: DiagramActionSubmission
	): DiagramActionSubmission {
		const { requestId: _requestId, ...intent } = candidate;
		return (
			saved.find(
				({ requestId: _id, ...previous }) => JSON.stringify(previous) === JSON.stringify(intent)
			) ?? candidate
		);
	}
}
