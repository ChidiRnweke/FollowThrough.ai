export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type UserId = Brand<string, 'UserId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type NoteId = Brand<string, 'NoteId'>;
export type NoteEtag = Brand<string, 'NoteEtag'>;
export type NoteRevisionId = Brand<string, 'NoteRevisionId'>;
export type TodoId = Brand<string, 'TodoId'>;
export type RelationshipId = Brand<string, 'RelationshipId'>;
export type ReferenceId = Brand<string, 'ReferenceId'>;
export type DiagramId = Brand<string, 'DiagramId'>;
export type SkillUsageId = Brand<string, 'SkillUsageId'>;
export type SuggestionId = Brand<string, 'SuggestionId'>;
export type SourceAnchorId = Brand<string, 'SourceAnchorId'>;
export type ProvenanceId = Brand<string, 'ProvenanceId'>;
export type ConversationId = Brand<string, 'ConversationId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type SearchDocumentId = Brand<string, 'SearchDocumentId'>;
export type AgentRunId = Brand<string, 'AgentRunId'>;
export type AttachmentId = Brand<string, 'AttachmentId'>;
export type AttachmentVersionId = Brand<string, 'AttachmentVersionId'>;
export type AttachmentUploadId = Brand<string, 'AttachmentUploadId'>;
export type AgentSessionItemId = Brand<string, 'AgentSessionItemId'>;
export type MemoryEntryId = Brand<string, 'MemoryEntryId'>;
export type ArtifactId = Brand<string, 'ArtifactId'>;
export type TemplateId = Brand<string, 'TemplateId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ApiTokenId = Brand<string, 'ApiTokenId'>;
export type DateTime = Brand<string, 'DateTime'>;
export type LocalDate = Brand<string, 'LocalDate'>;
export type Url = Brand<string, 'Url'>;
export type ContentHash = Brand<string, 'ContentHash'>;
export type Confidence = Brand<number, 'Confidence'>;
export type UserRole = 'USER' | 'ADMIN' | 'WAITING';
export interface ActorContext {
	readonly userId: UserId;
}
export interface PageRequest {
	readonly cursor?: string;
	readonly limit: number;
}
export interface Page<T> {
	readonly items: readonly T[];
	readonly nextCursor?: string;
}
export interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly Record<string, unknown>[];
}
export interface TextSelection {
	readonly noteId: NoteId;
	readonly revision: number;
	readonly from: number;
	readonly to: number;
	readonly text: string;
}
export type NoteKind = 'folder' | 'note' | 'skill';
export type TodoStatus = 'backlog' | 'open' | 'in_progress' | 'done' | 'cancelled';
export type TodoResponsibility = 'mine' | 'waiting_on';
export type TodoPriority = 'low' | 'medium' | 'high';
export type MemoryEntryType = 'fact' | 'decision' | 'constraint' | 'preference';
export type PromiseStrength = 'explicit' | 'implied' | 'tentative';
export type RelationshipKind = 'prior_decision' | 'contradicts' | 'elaborates' | 'mentions';
export type DiagramKind = 'mermaid' | 'drawio';
export type ReferenceTier = 'official' | 'standard' | 'vendor' | 'community';
export type PipelineKind = 'extract_promises' | 'relate' | 'reference' | 'agent' | 'memory';
export type ProducerKind = 'user' | 'pipeline' | 'agent';
export type SuggestionStatus = 'proposed' | 'accepted' | 'rejected' | 'expired' | 'reverted';
export type ApiTokenScope = 'read' | 'full';
export type ToolClassification = 'read' | 'proposal' | 'mutation';

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
 * that exists only in the return value of `AccessTokens.mint`.
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
	| 'createdAt'
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
	readonly visionModelOverride?: string;
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

/**
 * Which provider fulfils the agent's web searches. Declared here rather than in
 * the server's web-research module because the settings picker renders the list
 * and the stored preference is validated against it.
 */
export const webSearchEngines = [
	'auto',
	'native',
	'exa',
	'firecrawl',
	'parallel',
	'perplexity'
] as const;

export type WebSearchEngine = (typeof webSearchEngines)[number];

/**
 * The user's agent defaults. Every optional field is absent rather than null
 * when unset, and absent means "use the deployment default" — see the
 * `agent_preferences` table for why that distinction is load-bearing.
 */
export interface AgentPreferences {
	readonly userId: UserId;
	readonly defaultModel?: string;
	readonly defaultVisionModel?: string;
	/** Model behind inline ghost text. Never calls tools, so it need not support them. */
	readonly inlineModel?: string;
	/** Model that reads attachment images and OCRs documents. */
	readonly attachmentVisionModel?: string;
	readonly webSearchEngine?: WebSearchEngine;
	readonly webSearchMaxResults?: number;
	readonly webSearchMaxTotalResults?: number;
	/** Tool-calling turns one chat run may take before it is cut off. */
	readonly agentMaxTurns?: number;
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
	readonly supportsVision: boolean;
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
	readonly sourceCreatedAt?: DateTime;
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

export interface VersionedNote {
	readonly note: Note;
	readonly etag: NoteEtag;
}
export interface SyncNoteInput {
	readonly note: Note;
	readonly baseEtag: NoteEtag;
	readonly operationId: string;
}
export type SyncNoteOutput =
	| {
			readonly outcome: 'saved';
			readonly version: VersionedNote;
			readonly repairedAnchorIds: readonly SourceAnchorId[];
	  }
	| {
			readonly outcome: 'conflict';
			readonly baseEtag: NoteEtag;
			readonly remote: VersionedNote;
	  };
export interface NoteSyncInventoryEntry {
	readonly noteId: NoteId;
	readonly projectId: ProjectId;
	readonly etag: NoteEtag;
	readonly updatedAt: DateTime;
}
export interface ListNoteSyncInventoryInput {
	readonly projectId?: ProjectId;
}
export interface ListNoteSyncInventoryOutput {
	readonly entries: readonly NoteSyncInventoryEntry[];
}
export type NoteSyncRecordState = 'synced' | 'pending' | 'syncing' | 'conflict';
export interface NoteSyncRecord {
	readonly userId: UserId;
	readonly noteId: NoteId;
	readonly base: VersionedNote;
	readonly local: Note;
	readonly remote?: VersionedNote;
	readonly operationId: string;
	readonly editVersion: number;
	readonly state: NoteSyncRecordState;
	readonly updatedAt: DateTime;
}
export type NoteSyncStatus = 'loading' | 'synced' | 'saving' | 'pending' | 'conflict' | 'error';
export const noteEtag = (note: Pick<Note, 'id' | 'currentRevision'>): NoteEtag =>
	`note:${note.id}:r${note.currentRevision}` as NoteEtag;
export const noteMatchesEtag = (
	note: Pick<Note, 'id' | 'currentRevision'>,
	etag: NoteEtag
): boolean => noteEtag(note) === etag;
export const noteSyncContentEquals = (left: Note, right: Note): boolean =>
	left.title === right.title &&
	left.plainText === right.plainText &&
	left.isPinned === right.isPinned &&
	JSON.stringify(left.document) === JSON.stringify(right.document);

export interface PromiseCandidate {
	readonly action: string;
	readonly ownerName?: string;
	readonly responsibility: TodoResponsibility;
	readonly dueDateVerbatim?: string;
	readonly resolvedDueDate?: LocalDate;
	readonly strength: PromiseStrength;
	readonly confidence: number;
}

export interface LinkCandidate {
	readonly targetNoteId: NoteId;
	readonly kind: RelationshipKind;
	readonly justification: string;
	readonly confidence: number;
}

export interface ReferenceCandidate {
	readonly url: Url;
	readonly title: string;
	readonly tier: 'official' | 'standard' | 'vendor' | 'community';
	readonly relevanceNote: string;
	readonly confidence: number;
}

export interface ExtractPromisesInput {
	readonly selection: TextSelection;
}
export interface ExtractPromisesOutput {
	readonly anchorId: SourceAnchorId;
	readonly suggestions: readonly Suggestion[];
	readonly createdTodos: readonly Todo[];
}

export interface RelateSelectionInput {
	readonly selection: TextSelection;
}
export interface RelateSelectionOutput {
	readonly anchorId: SourceAnchorId;
	readonly suggestions: readonly Suggestion[];
}

export interface FindReferencesInput {
	readonly selection: TextSelection;
}
export type FindReferencesOutput =
	| {
			readonly outcome: 'found';
			readonly anchorId: SourceAnchorId;
			readonly suggestions: readonly Suggestion[];
	  }
	| { readonly outcome: 'nothing_relevant'; readonly anchorId: SourceAnchorId };

export interface GenerateMermaidDiagramInput {
	readonly selection: TextSelection;
	readonly instruction?: string;
}
export interface GenerateMermaidDiagramOutput {
	readonly anchorId: SourceAnchorId;
	readonly suggestion: Suggestion;
}

export interface ReviseMermaidDiagramInput {
	readonly diagramId: DiagramId;
	readonly instruction: string;
}
export interface ReviseMermaidDiagramOutput {
	readonly diagram: MermaidDiagram;
}
export interface ReviseInlineMermaidInput {
	readonly noteId: NoteId;
	readonly source: string;
	readonly instruction: string;
	readonly renderedPngDataUrl?: string;
}
export interface ReviseInlineMermaidOutput {
	readonly source: string;
	readonly title?: string;
}
export interface ConvertInlineMermaidInput {
	readonly noteId: NoteId;
	readonly source: string;
	readonly instruction?: string;
}
export interface ConvertInlineMermaidOutput {
	readonly suggestion: Suggestion;
}
export interface GetDrawioDiagramInput {
	readonly noteId: NoteId;
	readonly diagramId: DiagramId;
}
export interface SaveDrawioDiagramInput extends GetDrawioDiagramInput {
	readonly source: string;
	readonly renderedSvg: string;
}
export interface SaveDrawioDiagramOutput {
	readonly diagram: DrawioDiagram;
}
export interface PromoteDiagramInput {
	readonly diagramId: DiagramId;
}
export interface PromoteDiagramOutput {
	readonly source: MermaidDiagram;
	readonly suggestion: Suggestion;
}

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

export interface ListMemoryInput {
	/** Omit projectId to list the user's profile memory. */
	readonly projectId?: ProjectId;
	readonly sharedOnly?: boolean;
}
export interface ListMemoryOutput {
	readonly entries: readonly MemoryEntry[];
}
export interface CreateMemoryEntryInput {
	/** Omit projectId to create a user-profile entry. */
	readonly projectId?: ProjectId;
	readonly content: string;
	readonly type?: MemoryEntryType;
	readonly shareWithAgents?: boolean;
}
export interface UpdateMemoryEntryInput {
	readonly memoryEntryId: MemoryEntryId;
	readonly content?: string;
	readonly type?: MemoryEntryType | null;
	readonly shareWithAgents?: boolean;
}
export interface DeleteMemoryEntryInput {
	readonly memoryEntryId: MemoryEntryId;
}
export interface ProposeMemoryChangeInput {
	readonly scope: MemoryScope;
	readonly projectId?: ProjectId;
	readonly operation: MemoryChangeOperation;
	readonly memoryEntryId?: MemoryEntryId;
	readonly content?: string;
	readonly shareWithAgents?: boolean;
	readonly justification?: string;
	readonly confidence?: number;
}
export interface ProposeMemoryChangeOutput {
	readonly suggestion: Suggestion;
	readonly appliedEntry?: MemoryEntry;
}

export interface RunAgentInput {
	readonly requestId?: string;
	readonly conversationId?: ConversationId;
	readonly projectId?: ProjectId;
	readonly noteId?: NoteId;
	readonly selection?: TextSelection;
	readonly contextNoteIds?: readonly NoteId[];
	readonly requestedSkillNames?: readonly string[];
	readonly requestedSkillNoteIds?: readonly NoteId[];
	readonly modelOverride?: string | null;
	readonly visionModelOverride?: string | null;
	readonly executionModeOverride?: import('./domain').AgentExecutionMode | null;
	/**
	 * Limits resolved from the user's preferences when the run was staged, not
	 * chosen per message. They travel on the request because the services that
	 * honour them are constructed once for the process and never see an actor.
	 */
	readonly maxTurns?: number;
	readonly webSearch?: {
		readonly engine?: WebSearchEngine;
		readonly maxResults?: number;
		readonly maxTotalResults?: number;
	};
	readonly prompt: string;
	readonly images?: readonly ConversationImageInput[];
	readonly appContext?: import('./app-context').AppContextSnapshotV1;
	/**
	 * Scope the request was staged with, kept only when the live snapshot
	 * overrode it. The snapshot still wins; this is carried so the agent can be
	 * told what the user was pointing at when they asked.
	 */
	readonly requestedScope?: {
		readonly projectId?: ProjectId;
		readonly noteId?: NoteId;
	};
}
export interface ConversationImageInput {
	readonly id: string;
	readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
	readonly dataUrl: string;
	readonly name: string;
}
/**
 * One request for proactive ghost text at the caret. The window around the
 * caret is plain text: the editor serialises the document, so the model never
 * sees ProseMirror JSON on this path.
 */
export interface InlineSuggestionRequest {
	readonly requestId: string;
	readonly noteId: NoteId;
	/** Authoritative project scope, populated by the server controller. */
	readonly projectId?: ProjectId;
	readonly revision: number;
	readonly blockType: string;
	readonly headingPath: readonly string[];
	readonly currentSection: string;
	readonly prefix: string;
	readonly suffix: string;
	readonly heading?: string;
}

export interface InlineCompletionPassage {
	readonly sourceTitle: string;
	readonly sourceType: 'note' | 'attachment' | 'diagram' | 'project-memory';
	readonly sectionPath?: string;
	readonly content: string;
}

/** Raw workspace context assembled deterministically for one caret completion. */
export interface InlineCompletionContext {
	readonly noteTitle: string;
	readonly noteText: string;
	readonly userMemory: readonly string[];
	readonly projectPassages: readonly InlineCompletionPassage[];
}

export interface InlineSuggestionGrounding {
	readonly currentNote: true;
	readonly userMemoryCount: number;
	readonly projectPassageCount: number;
}

export type InlineSuggestion =
	| {
			readonly outcome: 'suggested';
			readonly text: string;
			readonly grounding: InlineSuggestionGrounding;
	  }
	| { readonly outcome: 'no_suggestion'; readonly reason: 'ineligible' | 'empty_model' }
	| { readonly outcome: 'busy' | 'rate_limited'; readonly retryAfterMs: number };

export interface SubmitAgentRunInput {
	readonly requestId: string;
	readonly conversationId?: ConversationId;
	readonly input: string;
	readonly images?: readonly ConversationImageInput[];
	readonly model?: string | null;
	readonly visionModel?: string | null;
	readonly mode?: import('./domain').AgentExecutionMode | null;
	readonly projectId?: ProjectId;
	readonly noteId?: NoteId;
	readonly selection?: TextSelection;
	readonly contextNoteIds?: readonly NoteId[];
	readonly requestedSkillNames?: readonly string[];
	readonly requestedSkillNoteIds?: readonly NoteId[];
	readonly appContext?: import('./app-context').AppContextSnapshotV1;
	/**
	 * One-based position of the user message this submission replaces, counted
	 * among user messages only. Set when a question is edited or asked again: the
	 * conversation is rewound to just before that turn before the new run starts.
	 * Control flag, not part of the frozen input — a retry of the resulting run
	 * must not rewind a second time.
	 */
	readonly retryUserOrdinal?: number;
}
export type AgentEvent =
	| {
			readonly type: 'run_queued';
			readonly runId: AgentRunId;
			readonly attempt: number;
			readonly reason: 'submitted' | 'retry' | 'resumed';
	  }
	| { readonly type: 'run_started'; readonly runId: AgentRunId; readonly attempt: number }
	| { readonly type: 'text_delta'; readonly text: string }
	| { readonly type: 'reasoning_delta'; readonly text: string }
	| {
			readonly type: 'tool_started';
			readonly callId: string;
			readonly name: string;
			readonly arguments: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly type: 'tool_completed';
			readonly callId: string;
			readonly name: string;
			readonly output?: unknown;
			readonly failure?: string;
	  }
	| {
			readonly type: 'approval_required';
			readonly runId: AgentRunId;
			readonly callId: string;
			readonly name: string;
			readonly arguments: Readonly<Record<string, unknown>>;
	  }
	| { readonly type: 'suggestion'; readonly suggestion: Suggestion }
	| {
			readonly type: 'failed';
			readonly runId?: AgentRunId;
			readonly code: string;
			readonly message: string;
			readonly retryable: boolean;
	  }
	| { readonly type: 'cancelled'; readonly runId: AgentRunId; readonly message: string }
	| {
			readonly type: 'completed';
			readonly conversationId: ConversationId;
			readonly runId?: AgentRunId;
			readonly model?: string;
	  }
	| { readonly type: 'resources_stale'; readonly resources: readonly string[] };

export interface DecideAgentRunInput {
	readonly runId: AgentRunId;
	readonly callId: string;
	readonly decision: 'approve' | 'reject';
	readonly message?: string;
}

/**
 * One turn can park on several tool calls at once, and the user answers them as a batch.
 * Deciding them one at a time would requeue the run between each, so they travel together.
 */
export interface DecideAgentRunBatchInput {
	readonly runId: AgentRunId;
	readonly callIds: readonly string[];
	readonly decision: 'approve' | 'reject';
	readonly message?: string;
}

/** A partial edit: omitted fields keep their stored value, `defaultModel: null` clears it. */
export interface UpdateAgentPreferencesInput {
	readonly defaultModel?: string | null;
	readonly defaultVisionModel?: string | null;
	readonly inlineModel?: string | null;
	readonly attachmentVisionModel?: string | null;
	readonly webSearchEngine?: WebSearchEngine | null;
	readonly webSearchMaxResults?: number | null;
	readonly webSearchMaxTotalResults?: number | null;
	readonly agentMaxTurns?: number | null;
	readonly executionMode?: import('./domain').AgentExecutionMode;
	readonly inlineSuggestionsEnabled?: boolean;
}

export interface RestoreSkillVersionInput {
	readonly noteId: NoteId;
	readonly revision: number;
}

export interface LoadSkillInput {
	readonly noteId: NoteId;
	readonly contextNoteId?: NoteId;
	readonly provenanceId: ProvenanceId;
}

export interface SaveNoteInput {
	readonly note: Note;
}
export interface SaveNoteOutput {
	readonly note: Note;
	readonly etag: NoteEtag;
	readonly repairedAnchorIds: readonly SourceAnchorId[];
}

export interface PublishNoteInput {
	readonly noteId: NoteId;
	readonly baseEtag: NoteEtag;
}
export interface PublishNoteOutput {
	readonly note: Note;
	readonly etag: NoteEtag;
}

export interface DiscardNoteDraftInput {
	readonly noteId: NoteId;
}
export interface DiscardNoteDraftOutput {
	readonly note: Note;
	readonly etag: NoteEtag;
}

export interface CreateSkillFromSelectionInput {
	readonly selection: TextSelection;
	readonly name: string;
	readonly description: string;
	readonly triggerHints: readonly string[];
}
export interface CreateSkillFromSelectionOutput {
	readonly skillNoteId: NoteId;
}

export interface CreateSkillInput {
	readonly name: string;
	readonly description?: string;
	readonly triggerHints?: readonly string[];
	readonly projectId?: ProjectId;
	readonly parentId?: NoteId;
}
export interface CreateSkillOutput {
	readonly skill: Skill;
}

export type NoteRef = Pick<Note, 'id' | 'title'>;

export interface ProjectTreeNode {
	readonly entry: NoteSummary;
	readonly children: readonly ProjectTreeNode[];
}

export interface ProjectView {
	readonly project: Project;
	readonly tree: readonly ProjectTreeNode[];
}

export interface TodoView {
	readonly todo: Todo;
	readonly sourceNote?: NoteRef;
	readonly originNote?: NoteRef;
	readonly anchor?: SourceAnchor;
	readonly provenance?: Provenance;
}

export interface GetTodoViewInput {
	readonly todoId: TodoId;
}

export interface SuggestionView {
	readonly suggestion: Suggestion;
	readonly note?: NoteRef;
	readonly anchor?: SourceAnchor;
	readonly provenance: Provenance;
}

export interface MemorySuggestionView extends Omit<SuggestionView, 'suggestion'> {
	readonly suggestion: MemorySuggestion;
}

export interface BacklinkView {
	readonly relationship: NoteRelationship;
	readonly sourceNote: NoteRef;
	readonly targetNote: NoteRef;
}

export interface ReferenceView {
	readonly reference: ExternalReference;
	readonly anchor?: SourceAnchor;
}

export interface NoteView {
	readonly note: Note;
	readonly etag: NoteEtag;
	readonly backlinks: readonly BacklinkView[];
	readonly references: readonly ReferenceView[];
	readonly diagrams: readonly Diagram[];
	readonly todos: readonly TodoView[];
	readonly pendingSuggestions: readonly SuggestionView[];
}

export interface TodayView {
	readonly overdue: readonly TodoView[];
	readonly dueToday: readonly TodoView[];
	readonly waitingOn: readonly TodoView[];
	readonly pendingSuggestionCount: number;
	readonly pinnedNotes: readonly NoteSummary[];
	readonly recentNotes: readonly NoteSummary[];
}

export interface SkillUsageView {
	readonly usage: SkillUsage;
	readonly contextNote?: NoteRef;
}

export interface SkillView {
	readonly skill: Skill;
	readonly usages: readonly SkillUsageView[];
}

export interface ShellContext {
	readonly user: User;
	readonly projects: readonly Project[];
	readonly noteTree: readonly NoteSummary[];
	readonly skills: readonly SkillSummary[];
	readonly pendingSuggestionCount: number;
	readonly pendingMemoryNotifications: readonly PendingMemoryNotification[];
}

export interface PendingMemoryNotification {
	readonly projectId?: ProjectId;
	readonly label: string;
	readonly href: string;
	readonly count: number;
}

export interface ConversationSummary {
	readonly id: ConversationId;
	readonly title?: string;
	readonly contextProjectId?: ProjectId;
	readonly contextNoteId?: NoteId;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
	readonly project?: Pick<Project, 'id' | 'name'>;
	readonly note?: NoteRef;
}

export interface GetNoteViewInput {
	readonly noteId: NoteId;
}

export interface GetTodayViewInput {
	readonly today: LocalDate;
}

export interface TodoListFilter {
	readonly projectId?: ProjectId;
	readonly status?: TodoStatus;
	readonly responsibility?: TodoResponsibility;
	readonly noteId?: NoteId;
	readonly dueBefore?: LocalDate;
	readonly category?: string;
}

export interface ListTodosOutput {
	readonly todos: readonly TodoView[];
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

export interface ListPendingMemoryInput {
	readonly projectId?: ProjectId;
}

export interface ListPendingMemoryOutput {
	readonly suggestions: readonly MemorySuggestionView[];
}

export interface ListSkillsOutput {
	readonly skills: readonly SkillSummary[];
}

export interface GetSkillViewInput {
	readonly noteId: NoteId;
}

export interface GetTrustPoliciesOutput {
	readonly policies: readonly TrustPolicy[];
}

export interface CreateNoteInput {
	readonly projectId?: ProjectId;
	readonly title: string;
	readonly parentId?: NoteId;
}

export interface CreateProjectInput {
	readonly name: string;
	readonly description?: string;
}

export interface CreateProjectOutput {
	readonly project: Project;
}

export interface ListProjectsOutput {
	readonly projects: readonly Project[];
}

export interface GetProjectInput {
	readonly projectId: ProjectId;
}

export interface GetProjectOutput {
	readonly project: Project;
	readonly tree: readonly ProjectTreeNode[];
}

export interface ImportMarkdownArchiveInput {
	readonly projectId: ProjectId;
	/** Import under an existing folder rather than at the project root. */
	readonly parentId?: NoteId;
	readonly archive: Uint8Array;
	readonly fileName: string;
}

/**
 * What an import actually did.
 *
 * Import is not all-or-nothing, so the report is not optional polish: without it a
 * partial import is invisible, and a file that was skipped looks identical to one that
 * was never in the archive.
 */
export interface ImportMarkdownArchiveOutput {
	readonly importedNoteIds: readonly NoteId[];
	readonly createdFolderIds: readonly NoteId[];
	/** Present in the archive, deliberately not imported. */
	readonly skipped: readonly { readonly path: string; readonly reason: string }[];
	/** Meant to be imported, but could not be. */
	readonly failed: readonly { readonly path: string; readonly message: string }[];
	/** Frontmatter the importer had nowhere to put, so it is named rather than dropped. */
	readonly unmappedFrontmatterKeys: readonly string[];
}

export interface CreateFolderInput {
	readonly projectId: ProjectId;
	readonly name: string;
	readonly parentId?: NoteId;
}

export interface CreateFolderOutput {
	readonly folder: Note;
}

export interface MoveProjectEntryInput {
	readonly projectId: ProjectId;
	readonly entryId: NoteId;
	readonly parentId?: NoteId;
	readonly position: number;
}

export interface MoveProjectEntryOutput {
	readonly entry: Note;
}

export interface RenameProjectInput {
	readonly projectId: ProjectId;
	readonly name: string;
	readonly description?: string;
}

export interface RenameProjectOutput {
	readonly project: Project;
}

export interface ArchiveProjectInput {
	readonly projectId: ProjectId;
}

export interface ArchiveProjectOutput {
	readonly project: Project;
}

export interface CreateNoteOutput {
	readonly note: Note;
}

export interface RenameNoteInput {
	readonly noteId: NoteId;
	readonly title: string;
}

export interface RenameNoteOutput {
	readonly note: Note;
}

export interface ArchiveNoteInput {
	readonly noteId: NoteId;
}

export interface ArchiveNoteOutput {
	readonly note: Note;
}

export interface UpdateTodoInput {
	readonly todoId: TodoId;
	readonly status?: TodoStatus;
	readonly title?: string;
	readonly description?: string | null;
	readonly dueDate?: LocalDate | null;
	readonly responsibility?: TodoResponsibility;
	readonly priority?: TodoPriority | null;
	readonly category?: string | null;
	readonly waitingOn?: string | null;
	readonly linkedNoteId?: NoteId | null;
}

export interface UpdateTodoOutput {
	readonly todo: Todo;
	readonly view: TodoView;
}

export interface UpdateTrustPolicyInput {
	readonly pipeline: PipelineKind;
	readonly autoAcceptEnabled: boolean;
	readonly minimumConfidence?: Confidence;
}

export interface UpdateTrustPolicyOutput {
	readonly policy: TrustPolicy;
}

export interface ListArtifactsOutput {
	readonly artifacts: readonly ArtifactView[];
	readonly total: number;
}

export interface ListArtifactsParams {
	readonly query?: string;
	readonly limit?: number;
	readonly offset?: number;
}

export type ExportFontFamily = 'helvetica' | 'times' | 'courier';

/**
 * Palette for diagrams embedded in an exported document.
 *
 * Hex values only: mermaid's colour library cannot parse `oklch()`, so the app's tokens
 * reach it as the hex equivalents in `mermaid-rendering.ts`. Absent keys fall back to
 * `base`, and `base` itself defaults to light — a document is read on paper more often
 * than on a dark screen.
 */
export interface ExportDiagramTheme {
	readonly base: 'light' | 'dark';
	readonly colors?: Readonly<Record<string, string>>;
}

export interface ExportSettings {
	readonly fontFamily: ExportFontFamily;
	/** Body font size in points. */
	readonly fontSize: number;
	/** Line height multiplier. */
	readonly lineHeight: number;
	/** Page margin in points, applied to all sides. */
	readonly margin: number;
	/** Render the file name as a heading on the first page. Omitted means off. */
	readonly includeTitle?: boolean;
	/** How embedded diagrams are coloured. Omitted means the light preset. */
	readonly diagramTheme?: ExportDiagramTheme;
}

export const defaultExportSettings: ExportSettings = {
	fontFamily: 'helvetica',
	fontSize: 11,
	lineHeight: 1.35,
	margin: 72,
	includeTitle: false,
	diagramTheme: { base: 'light' }
};

export interface GenerateDocumentInput {
	readonly projectId: ProjectId;
	readonly noteIds: NoteId[];
	readonly title: string;
	readonly format: 'docx' | 'pdf';
	readonly templateId?: TemplateId;
	readonly settings?: ExportSettings;
	/** Mermaid SVGs pre-rendered by the browser, keyed by SHA-256 of the diagram source. */
	readonly diagramSvgs?: Record<string, string>;
	/** PNG rasters of the same diagrams, keyed identically; DOCX embeds the raster. */
	readonly diagramPngs?: Record<string, string>;
}

export interface PreviewDocumentInput {
	readonly projectId: ProjectId;
	readonly noteIds: NoteId[];
	readonly title: string;
	readonly settings?: ExportSettings;
	readonly diagramSvgs?: Record<string, string>;
	readonly diagramPngs?: Record<string, string>;
}

export interface PreviewDocumentOutput {
	/** Base64-encoded PDF bytes. */
	readonly data: string;
}

export interface GenerateDocumentOutput {
	readonly artifact: Artifact;
	readonly downloadUrl: string;
}

export interface InitiateTemplateUploadInput {
	readonly projectId: ProjectId;
	readonly name: string;
	readonly mediaType: string;
	readonly byteSize: number;
	readonly checksumSha256: string;
}

export interface InitiateTemplateUploadOutput {
	readonly templateId: TemplateId;
	readonly uploadUrl: string;
	readonly requiredHeaders: Record<string, string>;
}

export interface GetArtifactDownloadOutput {
	readonly url: string;
}

export interface RegenerateArtifactOutput {
	readonly artifact: Artifact;
	readonly downloadUrl: string;
}
