import {
	applyNotePatch,
	describeNotePatchFailure,
	type Note,
	type NoteEdit,
	type NotePatchFailure
} from '$lib/models';
import {
	noteContentFromMarkdown,
	noteMarkdownFromContent
} from '$lib/components/edra/commands/note-markdown';

export type NotePatchPreview =
	| { readonly ok: true; readonly plainText: string }
	| { readonly ok: false; readonly problems: readonly string[] };

/**
 * What a set of edits would do to a note, computed locally.
 *
 * The approval card is handed the arguments the agent proposed, not the result, so
 * without this there is nothing to diff against and the card falls back to dumping JSON.
 * Running the same pure patch the server will run means the preview cannot disagree with
 * the outcome — and a patch that will be rejected can be shown as rejected before the
 * user approves it.
 */
export const previewNoteEdits = (note: Note, edits: readonly NoteEdit[]): NotePatchPreview => {
	try {
		const patched = applyNotePatch(noteMarkdownFromContent(note.document), edits);
		if (!patched.ok) return { ok: false, problems: patched.failures.map(describeNotePatchFailure) };
		return { ok: true, plainText: noteContentFromMarkdown(patched.markdown).plainText };
	} catch (error) {
		return {
			ok: false,
			problems: [error instanceof Error ? error.message : 'The edit could not be previewed.']
		};
	}
};

/** The note body a whole-body save would produce, for the same before/after comparison. */
export const previewNoteMarkdown = (markdown: string): NotePatchPreview => {
	try {
		return { ok: true, plainText: noteContentFromMarkdown(markdown).plainText };
	} catch (error) {
		return {
			ok: false,
			problems: [error instanceof Error ? error.message : 'The note body could not be previewed.']
		};
	}
};

export type { NoteEdit, NotePatchFailure };
