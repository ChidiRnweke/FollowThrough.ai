import type { DiagramId, Diagram } from '$lib/models/diagrams';
import type { Widget } from '$lib/models/widgets';
import type { AttachmentView } from '$lib/models/attachments';
import type { NoteId, TextSelection, NoteChangeReview } from '$lib/models/notes';
import {
	type ContextResourceRef,
	type ConversationId,
	type AgentExecutionMode,
	agentReviewSchema,
	agentToolNameSchema,
	type AgentRunId
} from '$lib/models/agent';
import { z } from 'zod';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import type { SuggestionView } from '$lib/models/suggestions';
import type { ProjectId } from '$lib/models/projects';
import type { ShellContext } from '$lib/models/workspace-views';
import type { AppContextSnapshotV1, PaneContext, SemanticInteraction } from '$lib/models/workspace';

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

export type ChatSessionKey = string;
export interface PersistedConversationChoices {
	conversationId?: ConversationId;
	modelOverride?: string | null;
	visionModelOverride?: string | null;
	executionModeOverride?: AgentExecutionMode;
}

export type PersistedConversationResult =
	| { readonly kind: 'missing' }
	| { readonly kind: 'valid'; readonly choices: PersistedConversationChoices }
	| { readonly kind: 'corrupt'; readonly message: string };

export const persistedConversationSchema = z.object({
	conversationId: z
		.string()
		.uuid()
		.transform((value) => value as ConversationId)
		.optional(),
	modelOverride: z.string().nullable().optional(),
	visionModelOverride: z.string().nullable().optional(),
	executionModeOverride: z.enum(['approval_required', 'auto_accept']).optional()
});

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
	| (ChatToolActivityBase & { readonly status: 'failed'; readonly failure: string })
	| (ChatToolActivityBase & { readonly status: 'rejected' });

export const legacyNoteReview: NoteChangeReview = {
	kind: 'failure',
	problems: ['This older approval has no saved review. Reject this call and request a new review.']
};

export const journalledToolSchema = z.object({
	review: agentReviewSchema.optional(),
	callId: z.string().nullish(),
	// A journalled row naming a tool the agent surface no longer has becomes an
	// `unreadable` transcript part rather than a row nothing can label.
	// `tests/unit/corpus.spec.ts` holds that at zero against the stored messages.
	name: agentToolNameSchema,
	input: z.custom<AgentPayload>(() => true).optional(),
	output: z.custom<AgentPayload>(() => true).optional(),
	failure: z.string().nullish(),
	status: z.enum(['running', 'approval_required', 'succeeded', 'reported_failure', 'failed'])
});

export type JournalledTool =
	| { readonly kind: 'readable'; readonly tool: ChatToolActivity }
	| { readonly kind: 'unreadable'; readonly reason: string };
export type FailedToolActivity = Extract<ChatToolActivity, { readonly status: 'failed' }>;
export type MutableChatPart =
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

export interface MutableChatEntry {
	readonly id: string;
	readonly role: 'user' | 'assistant';
	parts: MutableChatPart[];
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

export type ChatPart = Readonly<MutableChatPart>;
export type ChatEntry = Readonly<Omit<MutableChatEntry, 'parts' | 'suggestions'>> & {
	readonly parts: readonly ChatPart[];
	readonly suggestions: readonly SuggestionView[];
};
export interface ChatJournalMessage {
	readonly id: string;
	readonly role: 'user' | 'assistant' | 'tool' | 'system';
	readonly runId?: AgentRunId;
	readonly eventCursor?: string;
	readonly parts: readonly ChatPart[];
}

export interface ChatHandoff {
	readonly prompt: string;
	readonly noteId?: NoteId;
	readonly projectId?: ProjectId;
	readonly selection?: TextSelection;
	readonly requestedSkillNames?: readonly string[];
}

export const chatHandoffSchema = z.object({
	prompt: z.string(),
	noteId: z.string().min(1).optional(),
	projectId: z.string().min(1).optional(),
	selection: z
		.object({
			noteId: z.string().min(1),
			revision: z.number().int().nonnegative(),
			from: z.number().int().nonnegative(),
			to: z.number().int().nonnegative(),
			text: z.string()
		})
		.optional(),
	requestedSkillNames: z.array(z.string().min(1)).optional()
});

export interface ChatPaneReport {
	readonly conversationId?: string;
	readonly title: string;
}
export interface ChatWorkbenchFacts {
	readonly isWorkbenchPath: boolean;
	readonly interactionFocusedNoteId: NoteId | undefined;
	readonly focusedNoteId: NoteId | undefined;
	readonly splitNoteId: NoteId | undefined;
	readonly openNotes: readonly NoteId[];
	readonly openChats: readonly string[];
	readonly focusedWidget: Widget | undefined;
}
export interface ChatContextFacts {
	readonly shell: ShellContext | undefined;
	readonly pathname: string;
	readonly search: string;
	readonly workbench: ChatWorkbenchFacts;
	readonly panes: ReadonlyMap<NoteId, PaneContext>;
	readonly chatPanes: ReadonlyMap<string, ChatPaneReport>;
	readonly interactions: readonly SemanticInteraction[];
	readonly capturedAt: string;
	readonly client: AppContextSnapshotV1['client'];
}

const diagramIdField = z
	.string()
	.refine((value) => value.trim() !== '')
	.transform((value) => value as DiagramId);

/** What both writing tools answer with. */
export const writtenDiagram = z.object({ diagramId: diagramIdField });

/**
 * A saved diagram named by its id.
 *
 * The `kind` check is what makes this a *diagram* reader rather than an artifact
 * reader: `accept_suggestion` answers for every kind of suggestion, so without it
 * accepting a todo would put that todo on the diagram canvas.
 */
export const namedDiagram = z.object({
	id: diagramIdField,
	kind: z.enum(['drawio', 'mermaid'])
});

export const acceptedDiagram = z.object({ artifact: namedDiagram });

/** Existing HTTP/1.1 connection budget: four streams leave two origin connections for app requests. */
export const MAX_CONCURRENT_STREAMS = 4;
