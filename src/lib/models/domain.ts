import type {
	AgentRunId,
	AgentSessionItemId,
	ApiTokenId,
	ApiTokenScope,
	ArtifactId,
	AttachmentId,
	AttachmentUploadId,
	AttachmentVersionId,
	Confidence,
	ConversationId,
	DateTime,
	DiagramId,
	DiagramKind,
	LocalDate,
	MemoryEntryId,
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
	SessionId,
	SkillUsageId,
	SourceAnchorId,
	SuggestionId,
	SuggestionStatus,
	TemplateId,
	MemoryEntryType,
	TodoId,
	TodoPriority,
	TodoResponsibility,
	TodoStatus,
	ToolClassification,
	Url,
	UserId,
	UserRole
} from './shared';

export interface User {
	readonly id: UserId;
	readonly email: string;
	readonly displayName: string;
	readonly avatarUrl?: Url;
	readonly role: UserRole;
	readonly authProvider?: string;
	readonly authProviderId?: string;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface Session {
	readonly id: SessionId;
	readonly userId: UserId;
	readonly expiresAt: Date;
	readonly createdAt: DateTime;
}

/**
 * A bearer credential for the MCP endpoint. Never carries the plaintext token —
 * that exists only in the return value of `ApiTokenService.mint`.
 */
export interface ApiToken {
	readonly id: ApiTokenId;
	readonly userId: UserId;
	readonly name: string;
	readonly scope: ApiTokenScope;
	readonly lastUsedAt?: DateTime;
	readonly expiresAt?: DateTime;
	readonly revokedAt?: DateTime;
	readonly createdAt: DateTime;
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
	readonly publishedRevision: number;
	readonly isPinned: boolean;
	readonly publishedAt?: DateTime;
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
	| 'currentRevision'
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
	readonly priority?: TodoPriority;
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
	readonly slug?: string;
	readonly description: string;
	readonly triggerHints: readonly string[];
	readonly license?: string;
	readonly compatibility?: string;
	readonly metadata?: Readonly<Record<string, string>>;
	readonly allowImplicitInvocation?: boolean;
	readonly isEnabled: boolean;
}

export interface SkillManifest {
	readonly slug: string;
	readonly description: string;
	readonly license?: string;
	readonly compatibility?: string;
	readonly metadata: Readonly<Record<string, string>>;
	readonly allowImplicitInvocation: boolean;
	readonly instructions: string;
}

export type SkillSummary = Pick<
	Skill,
	'name' | 'slug' | 'description' | 'triggerHints' | 'allowImplicitInvocation' | 'isEnabled'
> & {
	readonly noteId: NoteId;
	readonly projectId?: ProjectId;
	readonly isPinned?: boolean;
};

export interface Attachment {
	readonly id: AttachmentId;
	readonly projectId: ProjectId;
	readonly noteId?: NoteId;
	readonly path: string;
	readonly currentVersionId: AttachmentVersionId;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface AttachmentVersion {
	readonly id: AttachmentVersionId;
	readonly attachmentId: AttachmentId;
	readonly objectKey: string;
	readonly mediaType: string;
	readonly byteSize: number;
	readonly checksumSha256: string;
	readonly parserKind?: string;
	readonly extractedText?: string;
	readonly processingStatus:
		'queued' | 'processing' | 'ready' | 'partial' | 'unsupported' | 'failed';
	readonly processingFailure?: string;
	readonly processedAt?: DateTime;
	readonly createdAt: DateTime;
}

export interface AttachmentUpload {
	readonly id: AttachmentUploadId;
	readonly projectId: ProjectId;
	readonly noteId?: NoteId;
	readonly path: string;
	readonly objectKey: string;
	readonly mediaType: string;
	readonly byteSize: number;
	readonly checksumSha256: string;
	readonly expiresAt: DateTime;
	readonly createdAt: DateTime;
}

export interface AttachmentView {
	readonly attachment: Attachment;
	readonly version: AttachmentVersion;
}

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
	readonly kind: 'chat' | 'workflow';
	readonly contextProjectId?: ProjectId;
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
	readonly runId?: AgentRunId;
	readonly eventCursor?: string;
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
export type AgentRunStatus =
	'queued' | 'running' | 'awaiting_approval' | 'cancelling' | 'completed' | 'failed' | 'cancelled';

export interface AgentPreferences {
	readonly userId: UserId;
	readonly defaultModel?: string;
	readonly executionMode: AgentExecutionMode;
	readonly inlineSuggestionsEnabled: boolean;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

/**
 * One agent tool as the settings surface sees it: its identity from the code,
 * its resolved on/off state, and which layer decided that state.
 *
 * `source` is what lets the UI distinguish "off everywhere" from "off just for
 * this project", which is the only way a per-project override can be reset.
 */
export interface ToolPreference {
	readonly name: string;
	readonly description: string;
	readonly classification: ToolClassification;
	readonly enabled: boolean;
	/** Locked tools are always enabled; turning them off would strand the agent. */
	readonly locked: boolean;
	readonly source: 'default' | 'user' | 'project';
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
	readonly requestId: string;
	readonly cancelRequestedAt?: DateTime;
	readonly startedAt?: DateTime;
	readonly finishedAt?: DateTime;
	readonly provenanceId?: ProvenanceId;
	readonly serializedState?: string;
	readonly pendingDecisions: readonly PendingAgentDecision[];
	readonly failure?: string;
	readonly providerErrorCode?: string;
	readonly contextSnapshot?: Readonly<Record<string, unknown>>;
	readonly inputSnapshot?: Readonly<Record<string, unknown>>;
	readonly retryOfRunId?: AgentRunId;
	readonly definitionVersion?: number;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface AgentRunReceipt {
	readonly runId: AgentRunId;
	readonly conversationId: ConversationId;
	readonly status: AgentRunStatus;
	readonly latestCursor: string;
}

export interface AgentRunSnapshot {
	readonly run: AgentRun;
	readonly latestCursor: string;
	readonly pendingDecisions: readonly PendingAgentDecision[];
}

export interface AgentSessionItem {
	readonly id: AgentSessionItemId;
	readonly conversationId: ConversationId;
	readonly position: number;
	readonly item: Readonly<Record<string, unknown>>;
	readonly createdAt: DateTime;
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
	readonly noteId?: NoteId;
	readonly memoryEntryId?: MemoryEntryId;
	readonly attachmentId?: AttachmentId;
	readonly attachmentPath?: string;
	readonly sourceTitle?: string;
	readonly sectionPath?: string;
	readonly diagramId?: DiagramId;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly content: string;
	readonly contentHash: string;
	readonly sourceRevision: number;
	readonly chunkIndex: number;
	readonly embedding?: readonly number[];
	readonly embeddingModel?: string;
	/**
	 * Present while a newer revision of this source is staged but not yet embedded.
	 * Superseded chunks are excluded from lexical search (their text is out of date)
	 * but still answer semantic search until their replacements carry vectors.
	 */
	readonly supersededAt?: DateTime;
}

export interface SearchMatch {
	readonly document: SearchDocument;
	readonly score: number;
}

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
export type MemorySuggestion = SuggestionBase<'memory', MemoryChangePayload>;
export type Suggestion =
	TodoSuggestion | BacklinkSuggestion | ReferenceSuggestion | DiagramSuggestion | MemorySuggestion;

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

export type MemoryChangeOperation = 'add' | 'update' | 'remove';
export type MemoryScope = 'project' | 'user';

export interface MemoryChangePayload {
	readonly projectId?: ProjectId;
	readonly operation: MemoryChangeOperation;
	readonly memoryEntryId?: MemoryEntryId;
	readonly content?: string;
	readonly shareWithAgents?: boolean;
	readonly justification?: string;
}

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

export interface ProjectTemplate {
	readonly id: TemplateId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly name: string;
	readonly objectKey: string;
	readonly mediaType: string;
	readonly byteSize: number;
	readonly extractedStyles?: Record<string, unknown>;
	readonly isDefault: boolean;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface ExtractedTemplateStyles {
	readonly fonts: {
		readonly heading: Record<
			string,
			{ name: string; size: number; bold: boolean; italic: boolean; color?: string }
		>;
		readonly body: { name: string; size: number; color?: string };
	};
	readonly pageMargins: { top: number; bottom: number; left: number; right: number };
	readonly headerImages?: string[];
	readonly footerContent?: string;
	readonly themeColors: Record<string, string>;
}

export interface Artifact {
	readonly id: ArtifactId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly title: string;
	readonly format: 'docx' | 'pdf';
	readonly objectKey: string;
	readonly byteSize: number;
	readonly sourceNoteIds: NoteId[];
	readonly templateId?: TemplateId;
	readonly provenanceId?: ProvenanceId;
	readonly runId?: AgentRunId;
	readonly createdAt: DateTime;
}

export interface ArtifactView {
	readonly id: ArtifactId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly title: string;
	readonly format: 'docx' | 'pdf';
	readonly objectKey: string;
	readonly byteSize: number;
	readonly sourceNoteIds: NoteId[];
	readonly templateId?: TemplateId;
	readonly provenanceId?: ProvenanceId;
	readonly runId?: AgentRunId;
	readonly createdAt: DateTime;
	readonly projectName: string;
	readonly templateName?: string;
	/** True when a source note changed after this artifact was generated. */
	readonly stale?: boolean;
}
