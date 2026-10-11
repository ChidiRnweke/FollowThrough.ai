import { z } from 'zod';
import type { ConversationId } from '$lib/models/agent';
import { agentPayloadSchema } from '$lib/models/agent/payload';
import type { AttachmentId } from '$lib/models/attachments';
import type { MemoryEntryId } from '$lib/models/memory';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';

/**
 * What the agent drew on, read back from the tool calls a conversation already journals.
 *
 * Derived rather than recorded: every call is a `messages` row, and the hits it returned
 * carry the project they came from, so a second write path would store the same fact twice.
 */

/** Context the project owns and the agent can be seen to have used. */
export type ProjectItem =
	| { readonly kind: 'note'; readonly id: NoteId; readonly title: string }
	| { readonly kind: 'attachment'; readonly id: AttachmentId; readonly title: string }
	| { readonly kind: 'memory'; readonly id: MemoryEntryId; readonly title: string };

/** A skill is the user's, not the project's, so it has no inventory to be missing from. */
export type ContextItem =
	ProjectItem | { readonly kind: 'skill'; readonly id: NoteId; readonly title: string };

/**
 * One item one call drew on. Project content is attributed to the project its own record
 * names — a search without a project scope still returns hits from exactly one project each.
 */
export type ContextTouch =
	| {
			readonly kind: 'note' | 'attachment' | 'memory';
			readonly id: string;
			readonly projectId: ProjectId;
			readonly conversationId: ConversationId;
			readonly at: DateTime;
	  }
	| {
			readonly kind: 'skill';
			readonly id: NoteId;
			readonly title: string;
			readonly conversationId: ConversationId;
			readonly at: DateTime;
	  };

/** A search that came back with nothing: a gap in what the project holds. */
export interface EmptySearch {
	readonly query: string;
	/** The scope the agent asked for; absent when it searched every project. */
	readonly projectId?: ProjectId;
	readonly conversationId: ConversationId;
	readonly at: DateTime;
}

export interface LoggedConversation {
	readonly id: ConversationId;
	readonly title?: string;
	/** The project the chat was opened from; absent for a chat with no project context. */
	readonly projectId?: ProjectId;
}

/** Everything the journal says the agent read, and how much of it could not be read back. */
export interface ToolContextLog {
	readonly touches: readonly ContextTouch[];
	readonly emptySearches: readonly EmptySearch[];
	readonly conversations: readonly LoggedConversation[];
	/** Context-reading calls whose stored shape this reader does not recognise. */
	readonly unreadableCalls: number;
}

export type AttachmentProcessing = 'queued' | 'processing' | 'partial' | 'unsupported' | 'failed';

/** What the project holds, so the summary can tell used from unused. */
export interface ProjectInventory {
	readonly items: readonly ProjectItem[];
	readonly hiddenAttachments: readonly HiddenAttachment[];
}

/** An attachment search cannot reach, because its text was never extracted in full. */
export interface HiddenAttachment {
	readonly id: AttachmentId;
	readonly title: string;
	readonly status: AttachmentProcessing;
	readonly failure?: string;
}

export interface UsageRow {
	readonly item: ContextItem;
	readonly uses: number;
	readonly lastUsedAt: DateTime;
}

/** One query that found nothing, however many times the agent asked it. */
export interface MissedSearch {
	readonly query: string;
	readonly times: number;
	readonly lastAt: DateTime;
	/** The chat that asked it last, where the reader can see why it was asked. */
	readonly conversationId: ConversationId;
}

export interface ChatUsage {
	readonly conversationId: ConversationId;
	readonly title?: string;
	readonly lastUsedAt: DateTime;
	readonly items: readonly ContextItem[];
}

/** Lookups in one week, by the kind of thing looked up. */
export interface WeeklyLookups {
	/** Monday, 00:00 UTC. */
	readonly weekStart: DateTime;
	readonly note: number;
	readonly attachment: number;
	readonly memory: number;
	readonly skill: number;
}

/** How much of one kind of project content the agent has looked up at least once. */
export interface KindCoverage {
	readonly kind: ProjectItem['kind'];
	readonly used: number;
	readonly total: number;
}

export interface ProjectContextUsageSummary {
	/** Most-used first; ties go to the most recently used. */
	readonly mostUsed: readonly UsageRow[];
	readonly neverUsed: readonly ProjectItem[];
	/** Most recent first. */
	readonly chats: readonly ChatUsage[];
	readonly hiddenAttachments: readonly HiddenAttachment[];
	/** Most-repeated first, then most recent. */
	readonly missedSearches: readonly MissedSearch[];
	/** Every week from the first lookup to this one, empty weeks included; none without lookups. */
	readonly activity: readonly WeeklyLookups[];
	/** Notes, files and memory, in that order. */
	readonly coverage: readonly KindCoverage[];
	readonly unreadableCalls: number;
}

export const projectContextUsageInputSchema = z.object({ projectId: z.uuid() });

// --- The journalled tool-call fragments this reader understands ---

const uuid = z.uuid();

/**
 * One journalled `tool_activity` row. The archive writes a call twice — once with its
 * arguments as it starts, once settled with its output and the arguments as `{}` — so a
 * row alone is half a call, and the reader pairs them by `callId`.
 */
export const journalledCallSchema = z.object({
	name: z.string(),
	callId: z.string().nullish(),
	status: z.string(),
	input: z.record(z.string(), agentPayloadSchema).nullish(),
	output: agentPayloadSchema.nullish()
});

/** One hit of `search` / `search_note`: the source names its own project. */
export const searchHitSchema = z.object({
	source: z.discriminatedUnion('kind', [
		z.object({ kind: z.enum(['note', 'attachment', 'memory']), id: uuid, projectId: uuid }),
		z.object({ kind: z.enum(['diagram', 'widget', 'unavailable']) })
	])
});
export const searchOutputSchema = z.array(searchHitSchema);
export const searchInputSchema = z.object({
	query: z.string(),
	projectId: uuid.nullish()
});

/** `sed` names one file; `grep` names every file it matched in. */
export const sedOutputSchema = z.object({ kind: z.literal('content'), path: z.string() });
export const grepOutputSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('matches'), matches: z.array(z.object({ path: z.string() })) }),
	z.object({ kind: z.literal('no_matches') })
]);

export const getNoteOutputSchema = z.object({
	noteId: uuid,
	body: z.object({ file: z.object({ path: z.string() }) })
});

export const loadSkillOutputSchema = z.object({ noteId: uuid, name: z.string() });

export const listProjectMemoryOutputSchema = z.object({
	entries: z.array(z.object({ id: uuid, projectId: uuid }))
});
