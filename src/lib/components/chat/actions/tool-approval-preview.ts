import type { Note, NoteEdit, NoteId } from '$lib/models/notes';
import { previewNoteEdits, previewNoteMarkdown } from '$lib/client/notes/note-patch-preview';

/**
 * What an approval card should show for a pending tool call.
 *
 * The registry hands the card the *arguments* the agent proposed, never the result, so
 * anything meaningful has to be derived here. `save_note` used to be read as
 * `arguments.note` — a shape it has never had — which is why its diff silently never
 * rendered and every note body was dumped into the card as a raw JSON blob instead.
 */

/** Tools whose payload rewrites a note body, and so deserve a real before/after. */
const NOTE_BODY_TOOLS = new Set(['save_note', 'edit_note']);

export type ApprovalPreview =
	| { readonly kind: 'note'; readonly change: NoteChange }
	/** Nothing note-shaped to diff — the card describes the arguments instead. */
	| { readonly kind: 'arguments' };

export interface NoteChange {
	readonly title: string;
	readonly titleChange?: { readonly from: string; readonly to: string };
	/** Both sides as real documents, so the diff renders actual note content. */
	readonly body?: { readonly base: Note['document']; readonly candidate: Note['document'] };
	/**
	 * False when the baseline could not be loaded and `base` is a stand-in. The change is
	 * still shown — approving what you cannot see is the worse failure — but there is
	 * nothing to compare it against, so the card shows one side rather than a diff against
	 * an empty document, which would mark every line as added.
	 */
	readonly comparable: boolean;
	/** Reasons the edit will be rejected if approved, phrased for a person. */
	readonly problems: readonly string[];
	/** Changes with no diff to show, such as a pin or formatting-only edit. */
	readonly notices: readonly string[];
}

/** The note a pending call will change, so the card knows what to load for comparison. */
export const targetNoteId = (
	name: string,
	args: Readonly<Record<string, unknown>>
): NoteId | undefined => {
	if (!NOTE_BODY_TOOLS.has(name)) return undefined;
	return typeof args.noteId === 'string' ? (args.noteId as NoteId) : undefined;
};

export const isNoteBodyTool = (name: string): boolean => NOTE_BODY_TOOLS.has(name);

const candidateBody = (
	name: string,
	args: Readonly<Record<string, unknown>>,
	baseline: Note
): { document: Note['document']; plainText: string } | { problems: readonly string[] } => {
	if (name === 'save_note') {
		const markdown = typeof args.markdown === 'string' ? args.markdown : '';
		const preview = previewNoteMarkdown(markdown);
		return preview.ok
			? { document: preview.document, plainText: preview.plainText }
			: { problems: preview.problems };
	}
	const edits = Array.isArray(args.edits) ? (args.edits as NoteEdit[]) : [];
	if (edits.length === 0) return { problems: ['This edit has no changes in it.'] };
	const preview = previewNoteEdits(baseline, edits);
	return preview.ok
		? { document: preview.document, plainText: preview.plainText }
		: { problems: preview.problems };
};

const EMPTY_DOCUMENT = { type: 'doc', content: [] } as unknown as Note['document'];

/**
 * A whole-body save with no baseline to compare against. Falling through to the argument
 * card rendered *nothing at all* — `proseFields` skips note-body tools on purpose — so the
 * user was asked to approve a body they could not see. Showing one side is the honest
 * answer: it cannot say what changes, but it can always say what will be written.
 */
const uncomparableSave = (args: Readonly<Record<string, unknown>>): ApprovalPreview | undefined => {
	const markdown = typeof args.markdown === 'string' ? args.markdown : undefined;
	if (markdown === undefined) return undefined;
	const preview = previewNoteMarkdown(markdown);
	if (!preview.ok)
		return {
			kind: 'note',
			change: { title: 'Note', problems: preview.problems, notices: [], comparable: false }
		};
	return {
		kind: 'note',
		change: {
			title: 'Note',
			body: { base: EMPTY_DOCUMENT, candidate: preview.document },
			comparable: false,
			problems: [],
			notices: ['The current version could not be loaded, so this is what would be saved.']
		}
	};
};

export const approvalPreview = (
	name: string,
	args: Readonly<Record<string, unknown>>,
	baseline: Note | undefined
): ApprovalPreview => {
	if (!NOTE_BODY_TOOLS.has(name)) return { kind: 'arguments' };
	if (!baseline) return uncomparableSave(args) ?? { kind: 'arguments' };

	const result = candidateBody(name, args, baseline);
	if ('problems' in result)
		return {
			kind: 'note',
			change: { title: baseline.title, problems: result.problems, notices: [], comparable: true }
		};

	const notices: string[] = [];
	if (result.plainText === baseline.plainText)
		notices.push('This changes formatting only — the words stay the same.');

	return {
		kind: 'note',
		change: {
			title: baseline.title || 'Untitled',
			...(result.plainText === baseline.plainText
				? {}
				: { body: { base: baseline.document, candidate: result.document } }),
			comparable: true,
			problems: [],
			notices
		}
	};
};
