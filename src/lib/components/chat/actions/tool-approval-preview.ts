import type { Note, NoteEdit, NoteId } from '$lib/models/notes';
import type { AgentPreferences } from '$lib/models/agent';
import type { FieldChange } from '$lib/components/agent';
import { previewNoteEdits, previewNoteMarkdown } from '$lib/client/notes/note-patch-preview';
import { argumentLabel } from './tool-approval-fields';

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

/** The tool that rewrites the agent's own defaults, whose before-image the card already holds. */
const PREFERENCES_TOOL = 'update_agent_preferences';

export type ApprovalPreview =
	| { readonly kind: 'note'; readonly change: NoteChange }
	/**
	 * A change to the agent's own settings. "Default model: openai/gpt-5.6" cannot be
	 * approved on its own terms — it does not say whether that is a change at all, let
	 * alone from what — and the card holds the current preferences already, so it can say.
	 */
	| { readonly kind: 'settings'; readonly change: SettingsChange }
	/** Nothing note-shaped to diff — the card describes the arguments instead. */
	| { readonly kind: 'arguments' };

export interface SettingsChange {
	/** The fields that actually move, as `from → to`. */
	readonly changes: readonly FieldChange[];
	/** The Settings tab that owns these fields, so the card can hand the user the real control. */
	readonly settingsHref: string;
	/** Set when every proposed value is already the stored one. */
	readonly notice?: string;
}

/**
 * Which Settings tab owns a preference. The split mirrors the two forms the page posts —
 * `saveModelPreferences` and `saveAgentPreferences` — so the link lands on the control that
 * sets the same field rather than on the page in general.
 */
const AGENT_TAB_FIELDS = new Set([
	'webSearchEngine',
	'webSearchMaxResults',
	'webSearchMaxTotalResults',
	'agentMaxTurns',
	'executionMode'
]);

const settingsHref = (keys: readonly string[]): string =>
	keys.length > 0 && keys.every((key) => AGENT_TAB_FIELDS.has(key))
		? '/settings?tab=agents'
		: '/settings?tab=models';

/**
 * The proposed settings against the ones in force. Fields already holding the proposed value
 * are dropped rather than rendered as an arrow pointing at itself: a model that re-sends the
 * whole preference record would otherwise bury the one field it means to move.
 */
const settingsChange = (
	args: Readonly<Record<string, unknown>>,
	baseline: AgentPreferences | undefined
): SettingsChange => {
	const proposed = Object.entries(args).filter(
		([, value]) => value !== undefined && value !== null
	);
	const changes = proposed
		.filter(([key, value]) => {
			const current = baseline?.[key as keyof AgentPreferences];
			return current === undefined || String(current) !== String(value);
		})
		.map(([key, value]) => {
			const current = baseline?.[key as keyof AgentPreferences];
			return {
				label: argumentLabel(key),
				...(current === undefined ? {} : { from: String(current) }),
				to: String(value)
			};
		});
	const href = settingsHref(proposed.map(([key]) => key));
	if (proposed.length > 0 && changes.length === 0)
		return {
			changes: [],
			settingsHref: href,
			notice: 'These settings already have these values, so nothing would change.'
		};
	return { changes, settingsHref: href };
};

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
	baseline: Note | undefined,
	preferences?: AgentPreferences
): ApprovalPreview => {
	if (name === PREFERENCES_TOOL)
		return { kind: 'settings', change: settingsChange(args, preferences) };
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
