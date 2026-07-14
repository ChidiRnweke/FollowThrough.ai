import type {
	AgentRunId,
	Confidence,
	ConversationId,
	DateTime,
	DiagramId,
	DiagramKind,
	LocalDate,
	MessageId,
	NoteId,
	NoteKind,
	NoteRevisionId,
	PipelineKind,
	ProducerKind,
	ProjectId,
	PromiseStrength,
	ProseMirrorDocument,
	ProvenanceId,
	ReferenceId,
	ReferenceTier,
	RelationshipId,
	RelationshipKind,
	SearchDocumentId,
	SkillUsageId,
	SourceAnchorId,
	SuggestionId,
	SuggestionStatus,
	TodoId,
	TodoResponsibility,
	TodoStatus,
	Url,
	UserId
} from './shared';

export interface User {
	readonly id: UserId;
	readonly email: string;
	readonly displayName: string;
	readonly avatarUrl?: Url;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

/** Name of the auto-created project that holds unsorted notes and todos. */
export const DEFAULT_PROJECT_NAME = 'General';

export interface Project {
	readonly id: ProjectId;
	readonly userId: UserId;
	readonly name: string;
	readonly description?: string;
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface Note {
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
	readonly isPinned: boolean;
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export type NoteSummary = Pick<
	Note,
	| 'id'
	| 'projectId'
	| 'parentId'
	| 'kind'
	| 'position'
	| 'title'
	| 'isPinned'
	| 'archivedAt'
	| 'updatedAt'
>;

export interface NoteRevision {
	readonly id: NoteRevisionId;
	readonly noteId: NoteId;
	readonly revision: number;
	readonly title: string;
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
}

export interface SourceAnchor {
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

export interface Provenance {
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

export interface Todo {
	readonly id: TodoId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly title: string;
	readonly description?: string;
	readonly status: TodoStatus;
	readonly responsibility: TodoResponsibility;
	readonly waitingOn?: string;
	readonly dueDate?: LocalDate;
	readonly dueDateVerbatim?: string;
	readonly promiseStrength?: PromiseStrength;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
	readonly completedAt?: DateTime;
	readonly deletedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface NoteRelationship {
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

export interface ExternalReference {
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
	readonly noteId: NoteId;
	readonly title?: string;
	readonly renderedSvg?: string;
	readonly searchableText: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface MermaidDiagram extends DiagramBase {
	readonly kind: 'mermaid';
	readonly source: string;
}

export interface DrawioDiagram extends DiagramBase {
	readonly kind: 'drawio';
	readonly source: string;
	readonly promotedFromId?: DiagramId;
}

export type Diagram = MermaidDiagram | DrawioDiagram;

export interface Skill {
	readonly note: Note;
	readonly name: string;
	readonly description: string;
	readonly triggerHints: readonly string[];
	readonly isEnabled: boolean;
}

export type SkillSummary = Pick<Skill, 'name' | 'description' | 'triggerHints' | 'isEnabled'> & {
	readonly noteId: NoteId;
};

export interface SkillUsage {
	readonly id: SkillUsageId;
	readonly skillNoteId: NoteId;
	readonly contextNoteId?: NoteId;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
}

export interface TrustPolicy {
	readonly userId: UserId;
	readonly pipeline: PipelineKind;
	readonly autoAcceptEnabled: boolean;
	readonly minimumConfidence?: Confidence;
	readonly conditions: Readonly<Record<string, unknown>>;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface Conversation {
	readonly id: ConversationId;
	readonly userId: UserId;
	readonly contextNoteId?: NoteId;
	readonly title?: string;
	readonly modelOverride?: string;
	readonly executionModeOverride?: AgentExecutionMode;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface Message {
	readonly id: MessageId;
	readonly conversationId: ConversationId;
	readonly role: 'user' | 'assistant' | 'tool';
	readonly content: Readonly<Record<string, unknown>>;
	readonly model?: string;
	readonly createdAt: DateTime;
}

export interface ToolActivity {
	readonly callId: string;
	readonly name: string;
	readonly input: Readonly<Record<string, unknown>>;
	readonly output?: unknown;
	readonly failure?: string;
	readonly decision?: 'approved' | 'rejected';
	readonly status: 'running' | 'approval_required' | 'succeeded' | 'failed' | 'rejected';
}

export type AgentExecutionMode = 'approval_required' | 'auto_accept';
export type AgentRunStatus = 'running' | 'awaiting_approval' | 'completed' | 'failed';

export interface AgentPreferences {
	readonly userId: UserId;
	readonly defaultModel?: string;
	readonly executionMode: AgentExecutionMode;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface PendingAgentDecision {
	readonly callId: string;
	readonly toolName: string;
	readonly arguments: Readonly<Record<string, unknown>>;
}

export interface AgentRun {
	readonly id: AgentRunId;
	readonly userId: UserId;
	readonly conversationId: ConversationId;
	readonly model: string;
	readonly executionMode: AgentExecutionMode;
	readonly status: AgentRunStatus;
	readonly serializedState?: string;
	readonly pendingDecisions: readonly PendingAgentDecision[];
	readonly failure?: string;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface AgentModel {
	readonly id: string;
	readonly name: string;
	readonly provider: string;
	readonly contextLength?: number;
	readonly supportsTools: boolean;
	readonly recommended: boolean;
	readonly capabilities: readonly string[];
}

export interface SearchDocument {
	readonly id: SearchDocumentId;
	readonly projectId: ProjectId;
	readonly noteId: NoteId;
	readonly diagramId?: DiagramId;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly content: string;
	readonly contentHash: string;
	readonly sourceRevision: number;
	readonly chunkIndex: number;
	readonly embedding?: readonly number[];
	readonly embeddingModel?: string;
}

export interface SearchMatch {
	readonly document: SearchDocument;
	readonly score: number;
}

export type SuggestionKind = 'todo' | 'backlink' | 'reference' | 'diagram';

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

export type TodoSuggestion = SuggestionBase<'todo', CreateTodoInput>;
export type BacklinkSuggestion = SuggestionBase<'backlink', CreateRelationshipInput>;
export type ReferenceSuggestion = SuggestionBase<'reference', CreateReferenceInput>;
export type DiagramSuggestion = SuggestionBase<
	'diagram',
	{
		readonly noteId: NoteId;
		readonly kind: DiagramKind;
		readonly title?: string;
		readonly source: string;
	}
>;
export type Suggestion =
	TodoSuggestion | BacklinkSuggestion | ReferenceSuggestion | DiagramSuggestion;

export interface CreateTodoInput {
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

export interface CreateRelationshipInput {
	readonly sourceNoteId: NoteId;
	readonly targetNoteId: NoteId;
	readonly kind: RelationshipKind;
	readonly justification?: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

export interface CreateReferenceInput {
	readonly noteId: NoteId;
	readonly url: Url;
	readonly title: string;
	readonly tier: ReferenceTier;
	readonly relevanceNote: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}
