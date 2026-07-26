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
/**
 * What an MCP bearer token may reach. `read` exposes only read-classified
 * tools; `full` exposes proposals and mutations too.
 */
export type ApiTokenScope = 'read' | 'full';
/**
 * What a tool does to the workspace. `read` never writes, `proposal` queues a
 * suggestion for the user, `mutation` changes state directly.
 */
export type ToolClassification = 'read' | 'proposal' | 'mutation';
