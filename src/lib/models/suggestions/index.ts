import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

type ConversationId = Brand<string, 'ConversationId'>;

type TodoId = Brand<string, 'TodoId'>;

type RelationshipId = Brand<string, 'RelationshipId'>;

type ReferenceId = Brand<string, 'ReferenceId'>;

type DiagramId = Brand<string, 'DiagramId'>;

export type SuggestionId = Brand<string, 'SuggestionId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type AgentRunId = Brand<string, 'AgentRunId'>;

type MemoryEntryId = Brand<string, 'MemoryEntryId'>;

type DateTime = Brand<string, 'DateTime'>;

type LocalDate = Brand<string, 'LocalDate'>;

type Url = Brand<string, 'Url'>;

type Confidence = Brand<number, 'Confidence'>;

interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly Record<string, unknown>[];
}

type NoteKind = 'folder' | 'note' | 'skill';

type TodoStatus = 'backlog' | 'open' | 'in_progress' | 'done' | 'cancelled';

type TodoResponsibility = 'mine' | 'waiting_on';

type TodoPriority = 'low' | 'medium' | 'high';

type MemoryEntryType = 'fact' | 'decision' | 'constraint' | 'preference';

type PromiseStrength = 'explicit' | 'implied' | 'tentative';

type RelationshipKind = 'prior_decision' | 'contradicts' | 'elaborates' | 'mentions';

type DiagramKind = 'mermaid' | 'drawio';

type ReferenceTier = 'official' | 'standard' | 'vendor' | 'community';

type PipelineKind = 'extract_promises' | 'relate' | 'reference' | 'agent' | 'memory';

type ProducerKind = 'user' | 'pipeline' | 'agent';

export type SuggestionStatus = 'proposed' | 'accepted' | 'rejected' | 'expired' | 'reverted';

interface Note {
	readonly id: NoteId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly parentId?: NoteId;
	readonly kind: NoteKind;
	readonly position: number;
	readonly title: string;
	readonly builtInKey?: string;
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
	readonly currentRevision: number;
	readonly publishedRevision: number;
	readonly isPinned: boolean;
	readonly publishedAt?: DateTime;
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

interface SourceAnchor {
	readonly id: SourceAnchorId;
	readonly noteId: NoteId;
	readonly nodeId?: string;
	readonly from?: number;
	readonly to?: number;
	readonly quote: string;
	readonly prefix?: string;
	readonly suffix?: string;
	readonly revision: number;
	readonly createdAt: DateTime;
}

interface Provenance {
	readonly id: ProvenanceId;
	readonly userId: UserId;
	readonly producerKind: ProducerKind;
	readonly producerName: string;
	readonly pipeline?: PipelineKind;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly runId?: AgentRunId;
	readonly model?: string;
	readonly metadata: Readonly<Record<string, unknown>>;
	readonly createdAt: DateTime;
}

interface Todo {
	readonly id: TodoId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly title: string;
	readonly description?: string;
	readonly status: TodoStatus;
	readonly responsibility: TodoResponsibility;
	readonly priority?: TodoPriority;
	readonly category?: string;
	readonly waitingOn?: string;
	readonly dueDate?: LocalDate;
	readonly dueDateVerbatim?: string;
	readonly promiseStrength?: PromiseStrength;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly linkedNoteId?: NoteId;
	readonly provenanceId?: ProvenanceId;
	readonly completedAt?: DateTime;
	readonly deletedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

interface NoteRelationship {
	readonly id: RelationshipId;
	readonly userId: UserId;
	readonly sourceNoteId: NoteId;
	readonly targetNoteId: NoteId;
	readonly kind: RelationshipKind;
	readonly justification?: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

interface ExternalReference {
	readonly id: ReferenceId;
	readonly userId: UserId;
	readonly noteId: NoteId;
	readonly url: Url;
	readonly title: string;
	readonly tier: ReferenceTier;
	readonly relevanceNote: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
}

interface DiagramBase {
	readonly id: DiagramId;
	readonly userId: UserId;
	/** Diagrams are owned by their project; a source note is optional context. */
	readonly projectId: ProjectId;
	/** Absent for a studio diagram, which belongs to the project rather than a note. */
	readonly sourceNoteId?: NoteId;
	/** The studio conversation that produced this diagram, for reopening it. */
	readonly conversationId?: ConversationId;
	readonly title?: string;
	readonly renderedSvg?: string;
	readonly searchableText: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

interface MermaidDiagram extends DiagramBase {
	readonly kind: 'mermaid';
	readonly source: string;
}

interface DrawioDiagram extends DiagramBase {
	readonly kind: 'drawio';
	readonly source: string;
	readonly currentRevision: number;
	readonly publishedRevision: number;
	readonly publishedAt?: DateTime;
	readonly promotedFromId?: DiagramId;
}

type Diagram = MermaidDiagram | DrawioDiagram;

export type SuggestionKind = 'todo' | 'backlink' | 'reference' | 'diagram' | 'memory';

interface SuggestionBase<Kind extends SuggestionKind, Payload> {
	readonly id: SuggestionId;
	readonly userId: UserId;
	readonly noteId?: NoteId;
	readonly kind: Kind;
	readonly status: SuggestionStatus;
	readonly payload: Payload;
	readonly confidence?: Confidence;
	readonly provenanceId: ProvenanceId;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly decidedAt?: DateTime;
	readonly expiresAt?: DateTime;
	readonly appliedArtifactId?: string;
	readonly isAutoAccepted: boolean;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

type TodoSuggestion = SuggestionBase<'todo', CreateTodoInput>;

export type BacklinkSuggestion = SuggestionBase<'backlink', CreateRelationshipInput>;

type ReferenceSuggestion = SuggestionBase<'reference', CreateReferenceInput>;

type DiagramSuggestion = SuggestionBase<
	'diagram',
	{
		readonly noteId: NoteId;
		readonly kind: DiagramKind;
		readonly title?: string;
		readonly source: string;
	}
>;

type MemorySuggestion = SuggestionBase<'memory', MemoryChangePayload>;

export type Suggestion =
	TodoSuggestion | BacklinkSuggestion | ReferenceSuggestion | DiagramSuggestion | MemorySuggestion;

const persistedId = <T extends string>() => z.uuid().transform((value) => value as T);
const optionalSuggestionProvenance = {
	sourceAnchorId: persistedId<SourceAnchorId>().optional(),
	provenanceId: persistedId<ProvenanceId>().optional()
};
const suggestionPayloadSchemas = {
	todo: z
		.object({
			projectId: persistedId<ProjectId>(),
			title: z.string(),
			description: z.string().optional(),
			responsibility: z.enum(['mine', 'waiting_on']),
			waitingOn: z.string().optional(),
			dueDate: z
				.string()
				.transform((value) => value as LocalDate)
				.optional(),
			dueDateVerbatim: z.string().optional(),
			promiseStrength: z.enum(['explicit', 'implied', 'tentative']).optional(),
			...optionalSuggestionProvenance
		})
		.strict(),
	backlink: z
		.object({
			sourceNoteId: persistedId<NoteId>(),
			targetNoteId: persistedId<NoteId>(),
			kind: z.enum(['prior_decision', 'contradicts', 'elaborates', 'mentions']),
			justification: z.string().optional(),
			...optionalSuggestionProvenance
		})
		.strict(),
	reference: z
		.object({
			noteId: persistedId<NoteId>(),
			url: z.url().transform((value) => value as Url),
			title: z.string(),
			tier: z.enum(['official', 'standard', 'vendor', 'community']),
			relevanceNote: z.string(),
			...optionalSuggestionProvenance
		})
		.strict(),
	diagram: z
		.object({
			noteId: persistedId<NoteId>(),
			kind: z.enum(['mermaid', 'drawio']),
			title: z.string().optional(),
			source: z.string()
		})
		.strict(),
	memory: z
		.object({
			projectId: persistedId<ProjectId>().optional(),
			operation: z.enum(['add', 'update', 'remove']),
			memoryEntryId: persistedId<MemoryEntryId>().optional(),
			content: z.string().optional(),
			shareWithAgents: z.boolean().optional(),
			justification: z.string().optional()
		})
		.strict()
} satisfies {
	readonly [K in SuggestionKind]: z.ZodType<Extract<Suggestion, { kind: K }>['payload']>;
};

export const parseSuggestionPayload = (
	kind: SuggestionKind,
	value: unknown
): Suggestion['payload'] => {
	switch (kind) {
		case 'todo':
			return suggestionPayloadSchemas.todo.parse(value);
		case 'backlink':
			return suggestionPayloadSchemas.backlink.parse(value);
		case 'reference':
			return suggestionPayloadSchemas.reference.parse(value);
		case 'diagram':
			return suggestionPayloadSchemas.diagram.parse(value);
		case 'memory':
			return suggestionPayloadSchemas.memory.parse(value);
	}
};

/**
 * A durable remembered fact. Entries with a project hold project memory; entries
 * without one form the user's profile memory — who they are across all projects.
 */
export interface MemoryEntry {
	readonly id: MemoryEntryId;
	readonly userId: UserId;
	readonly projectId?: ProjectId;
	readonly content: string;
	readonly type?: MemoryEntryType;
	readonly shareWithAgents: boolean;
	readonly provenanceId?: ProvenanceId;
	readonly replacesEntryId?: MemoryEntryId;
	readonly deletedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

type MemoryChangeOperation = 'add' | 'update' | 'remove';

interface MemoryChangePayload {
	readonly projectId?: ProjectId;
	readonly operation: MemoryChangeOperation;
	readonly memoryEntryId?: MemoryEntryId;
	readonly content?: string;
	readonly shareWithAgents?: boolean;
	readonly justification?: string;
}

interface CreateTodoInput {
	readonly projectId: ProjectId;
	readonly title: string;
	readonly description?: string;
	readonly responsibility: TodoResponsibility;
	readonly waitingOn?: string;
	readonly dueDate?: LocalDate;
	readonly dueDateVerbatim?: string;
	readonly promiseStrength?: PromiseStrength;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

interface CreateRelationshipInput {
	readonly sourceNoteId: NoteId;
	readonly targetNoteId: NoteId;
	readonly kind: RelationshipKind;
	readonly justification?: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

interface CreateReferenceInput {
	readonly noteId: NoteId;
	readonly url: Url;
	readonly title: string;
	readonly tier: ReferenceTier;
	readonly relevanceNote: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

export interface SuggestionProposalBase {
	readonly noteId?: NoteId;
	readonly confidence?: number;
	readonly provenanceId: ProvenanceId;
	readonly sourceAnchorId?: SourceAnchorId;
}

export type SuggestionProposal =
	| (SuggestionProposalBase & { readonly kind: 'todo'; readonly payload: CreateTodoInput })
	| (SuggestionProposalBase & {
			readonly kind: 'backlink';
			readonly payload: CreateRelationshipInput;
	  })
	| (SuggestionProposalBase & {
			readonly kind: 'reference';
			readonly payload: CreateReferenceInput;
	  })
	| (SuggestionProposalBase & {
			readonly kind: 'diagram';
			readonly payload: { noteId: NoteId; kind: DiagramKind; title?: string; source: string };
	  })
	| (SuggestionProposalBase & { readonly kind: 'memory'; readonly payload: MemoryChangePayload });

export const materializeSuggestion = (
	proposal: SuggestionProposal,
	identity: { readonly id: SuggestionId; readonly userId: UserId; readonly now: DateTime }
): Suggestion => {
	const common = {
		id: identity.id,
		userId: identity.userId,
		status: 'proposed' as const,
		provenanceId: proposal.provenanceId,
		isAutoAccepted: false,
		createdAt: identity.now,
		updatedAt: identity.now,
		...(proposal.noteId !== undefined ? { noteId: proposal.noteId } : {}),
		...(proposal.confidence !== undefined
			? { confidence: proposal.confidence as Suggestion['confidence'] }
			: {}),
		...(proposal.sourceAnchorId !== undefined ? { sourceAnchorId: proposal.sourceAnchorId } : {})
	};
	switch (proposal.kind) {
		case 'todo':
			return { ...common, kind: 'todo', payload: proposal.payload };
		case 'backlink':
			return { ...common, kind: 'backlink', payload: proposal.payload };
		case 'reference':
			return { ...common, kind: 'reference', payload: proposal.payload };
		case 'diagram':
			return { ...common, kind: 'diagram', payload: proposal.payload };
		case 'memory':
			return { ...common, kind: 'memory', payload: proposal.payload };
	}
};

/** `autoAccepted` distinguishes a trust-policy auto-accept from a user's manual click, so the two are never conflated in the audit trail. */
export interface AcceptSuggestionInput {
	readonly suggestionId: SuggestionId;
	readonly autoAccepted?: boolean;
}

export interface AcceptSuggestionOutput {
	readonly suggestion: Suggestion;
	readonly artifact: Todo | NoteRelationship | ExternalReference | Diagram | MemoryEntry;
}

export interface RejectSuggestionInput {
	readonly suggestionId: SuggestionId;
}

export interface RevertSuggestionInput {
	readonly suggestionId: SuggestionId;
}

type NoteRef = Pick<Note, 'id' | 'title'>;

/** A suggestion with everything a review UI needs to render a decision: the source note, the quoted anchor, and who or what proposed it. */
export interface SuggestionView {
	readonly suggestion: Suggestion;
	readonly note?: NoteRef;
	readonly anchor?: SourceAnchor;
	readonly provenance: Provenance;
}

export interface ListSuggestionsInput {
	readonly status: SuggestionStatus;
}

export interface SuggestionGroup {
	readonly note?: NoteRef;
	readonly suggestions: readonly SuggestionView[];
}

export interface ListSuggestionsOutput {
	readonly groups: readonly SuggestionGroup[];
}
