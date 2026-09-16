import type { Note, NoteId, ReplaceNoteTextInput, NoteReplacementReport } from '$lib/models/notes';
import { noteCommand, type PreparedWorkspaceCommand } from '$lib/models/workspace-mutations';
import { replaceInNoteDocument } from '$lib/services/notes/text-search';

/** The captured editor base and its durable local write boundary. */
export interface NoteReplacementDraft {
	capture(): void;
	readonly value: Note | null;
	stage(
		command: PreparedWorkspaceCommand
	): Promise<{ kind: 'saved' } | { kind: 'failure'; message: string }>;
}

/** Capture all reviewed bodies before writes; retain each durable result if a later write fails. */
export async function replaceNoteDrafts(
	drafts: readonly NoteReplacementDraft[],
	input: ReplaceNoteTextInput
): Promise<NoteReplacementReport> {
	const edits = drafts.map((draft) => {
		draft.capture();
		const note = draft.value;
		if (!note) throw new Error('A matching note is unavailable. Search again before replacing.');
		return {
			draft,
			note,
			replacement: replaceInNoteDocument(note.document, input.query, input.replacement, input)
		};
	});
	const saved: { noteId: NoteId; title: string; matches: number }[] = [];
	for (const [index, { draft, note, replacement }] of edits.entries()) {
		if (!replacement) continue;
		try {
			const result = await draft.stage(
				noteCommand({ ...note, document: replacement.document, plainText: replacement.plainText })
			);
			if (result.kind === 'failure') throw new Error(result.message);
			saved.push({ noteId: note.id, title: note.title, matches: replacement.replaced });
		} catch (error) {
			return {
				kind: 'failure',
				saved,
				failed: {
					noteId: note.id,
					title: note.title,
					message: error instanceof Error ? error.message : 'Device storage is unavailable'
				},
				unattempted: edits
					.slice(index + 1)
					.filter((edit) => edit.replacement)
					.map((edit) => edit.note.id)
			};
		}
	}
	return { kind: 'complete', saved };
}
