import type { SuggestionView } from '$lib/models/suggestions';
type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

export type MemoryEntryId = Brand<string, 'MemoryEntryId'>;

type DateTime = Brand<string, 'DateTime'>;

export type MemoryEntryType = 'fact' | 'decision' | 'constraint' | 'preference';

export type MemorySuggestion = Extract<SuggestionView['suggestion'], { kind: 'memory' }>;

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

export interface ListMemoryInput {
	/** Omit projectId to list the user's profile memory. */
	readonly projectId?: ProjectId;
	readonly sharedOnly?: boolean;
}

export interface ListMemoryOutput {
	readonly entries: readonly MemoryEntry[];
}

export interface CreateMemoryEntryInput {
	readonly id?: MemoryEntryId;
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

/** `appliedEntry` is present only when the trust policy auto-accepted the change; otherwise the suggestion alone is returned, pending review. */
export interface ProposeMemoryChangeOutput<Proposal> {
	readonly suggestion: Proposal;
	readonly appliedEntry?: MemoryEntry;
}

export interface MemorySuggestionView extends Omit<SuggestionView, 'suggestion'> {
	readonly suggestion: MemorySuggestion;
}

/** One row in the bell menu: a project's pending-review count, or the single profile-memory row when `projectId` is absent. */
export interface PendingMemoryNotification {
	readonly projectId?: ProjectId;
	readonly label: string;
	readonly href: string;
	readonly count: number;
}

export interface ListPendingMemoryInput {
	readonly projectId?: ProjectId;
}

export interface ListPendingMemoryOutput {
	readonly suggestions: readonly MemorySuggestionView[];
}
