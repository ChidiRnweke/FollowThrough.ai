import type { Widget } from '$lib/models/widgets';
import type { Diagram } from '$lib/models/diagrams';
import type { AttachmentView } from '$lib/models/attachments';
import type { NoteId, TextSelection } from '$lib/models/notes';
import type { AgentRunId, ContextResourceRef } from '$lib/models/agent';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import type { NoteChangeReview } from '$lib/models/notes';
import type { SuggestionView } from '$lib/models/suggestions';

export type ResourceChip =
	| { readonly kind: 'note' | 'skill'; readonly id: NoteId; readonly name: string }
	| {
			readonly kind: 'folder';
			readonly id: NoteId;
			readonly name: string;
			readonly noteCount: number;
	  }
	| (ContextResourceRef & { readonly name: string });

/** The chip kinds that travel as `contextResources` rather than as note ids. */
export type ResourceKind = ContextResourceRef['kind'];

export interface SelectionChip {
	readonly kind: 'selection';
	readonly id: string;
	readonly name: string;
	readonly wordCount: number;
	readonly selection: TextSelection;
}

export type ContextChip = ResourceChip | SelectionChip;
export interface MentionReference {
	readonly chip: ResourceChip;
	readonly from: number;
	readonly to: number;
}
export interface MentionDocument {
	readonly text: string;
	readonly references: readonly MentionReference[];
}
export interface MentionHistory {
	readonly past: readonly MentionDocument[];
	readonly present: MentionDocument;
	readonly future: readonly MentionDocument[];
}
export interface MentionEdit {
	readonly from: number;
	readonly to: number;
	readonly text: string;
}
export interface ComposerSelection {
	readonly from: number;
	readonly to: number;
}
export type MentionInput =
	{ readonly kind: 'edit'; readonly edit: MentionEdit } | { readonly kind: 'untracked' };

export const MENTION_PATTERN = /(^|\s)@([^\s@]*)$/;

/** Whether the active note offers a passage to the composer. */
export type NoteSelectionContext =
	| { readonly kind: 'none' }
	| { readonly kind: 'selected'; readonly selection: TextSelection; readonly noteTitle: string };

export interface MentionableResources {
	readonly widgets: readonly Widget[];
	readonly diagrams: readonly Diagram[];
	readonly attachments: readonly AttachmentView[];
}

export const createMentionHistory = (text: string): MentionHistory => ({
	past: [],
	present: { text, references: [] },
	future: []
});

export type MentionRestore =
	{ readonly kind: 'restored'; readonly history: MentionHistory } | { readonly kind: 'untracked' };

export type ChatToolStatus =
	'running' | 'approval_required' | 'succeeded' | 'reported_failure' | 'failed' | 'rejected';

/** What every tool row carries, whatever became of the call. */
export interface ChatToolActivityBase {
	/** Absent when the provider reported the outcome without one; see `matchToolActivity`. */
	readonly callId?: string;
	readonly name: AgentToolName;
	readonly arguments: AgentPayloadObject;
	/** The run that produced it. Restored rows from before a run existed have none. */
	readonly runId?: string;
}

/**
 * One tool call as the transcript shows it.
 *
 * The client twin of `ToolActivity`, with one extra arm: `rejected` is what the
 * user just did to a parked approval, applied here before the run has caught up.
 *
 * Discriminated on `status` for the reason the model type gives — the payload
 * belongs to the arm that can have it. Two consequences worth knowing:
 * `tool.failure` does not typecheck until `status === 'failed'` has been
 * established, which is what retires the hand-written
 * `tool is ChatToolActivity & { failure: string }` predicate in `turn-activity`;
 * and a row cannot be moved from one arm to another by assignment, so a call
 * that settles replaces its row rather than being edited in place.
 */
export type ChatToolActivity =
	| (ChatToolActivityBase & { readonly status: 'running' })
	| (ChatToolActivityBase & {
			readonly status: 'approval_required';
			readonly noteReview?: NoteChangeReview;
	  })
	| (ChatToolActivityBase & { readonly status: 'succeeded'; readonly output?: AgentPayload })
	/** The tool returned, and what it returned says it failed (ADR 0035). */
	| (ChatToolActivityBase & {
			readonly status: 'reported_failure';
			readonly failure: string;
			readonly output: AgentPayload;
	  })
	| (Omit<ChatToolActivityBase, 'name'> & {
			readonly name: string;
			readonly status: 'failed';
			readonly failure: string;
	  })
	| (ChatToolActivityBase & { readonly status: 'rejected' });

export type ChatPart =
	| { kind: 'text'; text: string }
	| { kind: 'image'; id: string; dataUrl: string; name: string }
	| { kind: 'reasoning'; text: string }
	| { kind: 'tool'; tool: ChatToolActivity }
	/**
	 * A journalled row the transcript reader could not reconstruct.
	 *
	 * It is a part rather than a seventh `ChatToolActivity` status because it is
	 * not a tool call: nothing is known about it except that a row was there and
	 * could not be read. Modelling it as a tool call is what forced the invented
	 * `name: 'tool'` — a machine name, shown to a user, for a tool nobody called —
	 * and it is what kept `ChatToolActivity.name` a `string` while every persisted
	 * tool name closed over the catalog.
	 *
	 * Still a visible part, for the reason the fake tool row was: the work was
	 * attempted, and dropping the row reports a turn that did less than it did.
	 */
	| { kind: 'unreadable'; reason: string };

export interface ChatEntry {
	readonly id: string;
	readonly role: 'user' | 'assistant';
	parts: ChatPart[];
	suggestions: SuggestionView[];
	status?:
		| 'queued'
		| 'waiting'
		| 'streaming'
		| 'awaiting_approval'
		| 'cancelling'
		| 'completed'
		| 'failed'
		| 'cancelled';
	runId?: AgentRunId;
	attempt?: number;
	error?: string;
	retryable?: boolean;
}
