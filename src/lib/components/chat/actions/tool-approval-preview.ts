import type { Note, NoteChangeReview } from '$lib/models/notes';
import type { AgentPreferenceValues } from '$lib/models/agent';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import type { FieldChange } from '$lib/components/agent';
import { argumentLabel } from './tool-approval-fields';
import { readDrawioLabels } from '$lib/client/diagrams/drawio/labels';
import { drawioLabelDiff } from '$lib/models/diagrams/drawio-labels';

/**
 * What an approval card should show for a pending tool call.
 *
 * Note changes carry a saved domain review. Rendering never reapplies the agent's
 * arguments to a newer note. Other tools retain their existing argument presentation.
 */

/** Tools whose payload rewrites a note body, and so deserve a real before/after. */
const NOTE_BODY_TOOLS = new Set(['save_note', 'edit_note', 'save_skill', 'edit_skill']);

/** The tool that rewrites the agent's own defaults, whose before-image the card already holds. */
const PREFERENCES_TOOL = 'update_agent_preferences';

/**
 * What the card was given to compare the proposal against.
 *
 * One value rather than a `Note` beside an `AgentPreferenceValues`, because those two
 * were never both meaningful: a note baseline says nothing about a settings
 * change, and the pair made `{ note, preferences }` sayable for a tool that
 * touches neither. The arm names which tool is being approved, so a diagram edit
 * cannot be handed a note to diff against.
 */
export type ApprovalBaseline =
	/** Nothing to compare — still loading, or this tool has no before-image. */
	| { readonly kind: 'none' }
	| { readonly kind: 'note_review'; readonly review: NoteChangeReview }
	| { readonly kind: 'diagram'; readonly labels: readonly string[]; readonly title: string }
	| { readonly kind: 'preferences'; readonly preferences: AgentPreferenceValues };

/**
 * What a diagram approval shows.
 *
 * Labels, not a picture: the server cannot render draw.io, and a card that waited
 * for the browser to draw one would show nothing at the moment the user decides.
 * Labels are the part of a diagram a person recognises anyway.
 *
 * Two arms because creating and editing are different questions. Creating asks
 * "should this exist", so it lists what the diagram will contain. Editing asks
 * "should this change", so it shows the delta. One shape with an optional
 * `removed` would make an empty removal mean both "nothing was removed" and
 * "there was nothing to remove from".
 */
export type DiagramChange =
	| { readonly kind: 'created'; readonly title: string; readonly labels: readonly string[] }
	| {
			readonly kind: 'edited';
			readonly title: string;
			readonly added: readonly string[];
			readonly removed: readonly string[];
			readonly kept: number;
	  }
	/** The proposed source did not parse, so there is nothing truthful to show. */
	| { readonly kind: 'unreadable'; readonly title: string };

export type ApprovalPreview =
	| { readonly kind: 'note'; readonly change: NoteChange }
	| { readonly kind: 'diagram'; readonly change: DiagramChange }
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
	args: AgentPayloadObject,
	baseline: AgentPreferenceValues | undefined
): SettingsChange => {
	const proposed = Object.entries(args).filter(
		([, value]) => value !== undefined && value !== null
	);
	const changes = proposed
		.filter(([key, value]) => {
			const current = baseline?.[key as keyof AgentPreferenceValues];
			return current === undefined || String(current) !== String(value);
		})
		.map(([key, value]) => {
			const current = baseline?.[key as keyof AgentPreferenceValues];
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

export type NoteChange =
	| {
			readonly kind: 'prepared';
			readonly title: string;
			readonly body: { readonly base: Note['document']; readonly candidate: Note['document'] };
			readonly revision: number;
	  }
	| { readonly kind: 'failure'; readonly problems: readonly string[] };

export const isNoteBodyTool = (name: string): boolean => NOTE_BODY_TOOLS.has(name);

/** Tools whose payload is a whole draw.io document. */
const DIAGRAM_TOOLS = new Set(['create_diagram', 'edit_diagram']);

const diagramTitle = (args: AgentPayloadObject, fallback: string): string =>
	typeof args.title === 'string' && args.title.trim() ? args.title : fallback;

const diagramChange = (
	name: string,
	args: AgentPayloadObject,
	baseline: ApprovalBaseline
): DiagramChange => {
	const source = typeof args.source === 'string' ? args.source : '';
	const read = readDrawioLabels(source);
	const before = baseline.kind === 'diagram' ? baseline : undefined;
	const title = diagramTitle(args, before?.title ?? 'Untitled diagram');
	if (read.kind === 'unreadable') return { kind: 'unreadable', title };
	// An edit without its before-image cannot claim anything was added, so it
	// reports what the diagram will contain — the same answer creating gives.
	if (name !== 'edit_diagram' || !before) return { kind: 'created', title, labels: read.labels };
	return { kind: 'edited', title, ...drawioLabelDiff(before.labels, read.labels) };
};

export const approvalPreview = (
	name: string,
	args: AgentPayloadObject,
	baseline: ApprovalBaseline
): ApprovalPreview => {
	if (name === PREFERENCES_TOOL)
		return {
			kind: 'settings',
			change: settingsChange(
				args,
				baseline.kind === 'preferences' ? baseline.preferences : undefined
			)
		};
	if (DIAGRAM_TOOLS.has(name))
		return { kind: 'diagram', change: diagramChange(name, args, baseline) };
	if (!NOTE_BODY_TOOLS.has(name)) return { kind: 'arguments' };
	if (baseline.kind !== 'note_review')
		return {
			kind: 'note',
			change: {
				kind: 'failure',
				problems: ['This approval has no saved review. Reject this call and request a new review.']
			}
		};
	const review = baseline.review;
	if (review.kind === 'failure')
		return { kind: 'note', change: { kind: 'failure', problems: review.problems } };
	const { base, result } = review.change;
	return {
		kind: 'note',
		change: {
			kind: 'prepared',
			title: base.title,
			body: { base: base.document, candidate: result.document },
			revision: base.revision
		}
	};
};
