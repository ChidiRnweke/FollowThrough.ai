import type { AgentRunId } from '$lib/models/agent';
import type { ClipboardPaste, ClipboardSource } from '$lib/models/clipboard';
import type { DiagramId } from '$lib/models/diagrams';
import type {
	NoteId,
	NoteRevision,
	NoteRevisionId,
	NoteRevisionSummary,
	ProseMirrorDocument
} from '$lib/models/notes';
import type {
	OutboxEntry,
	OutboxProjection,
	ServerResource,
	WriteDraft,
	WriteOutcome,
	WriteReceipt,
	WriteRecovery
} from '$lib/models/outbox';
import type { SuggestionId } from '$lib/models/suggestions';
import type {
	CachedRecord,
	ResourceState,
	StoredCache,
	SyncCursor,
	SyncEtag,
	SyncObjectRead,
	SyncPage
} from '$lib/models/sync';
import type { DateTime } from '$lib/models/workspace';
import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import type { WorkspaceLocalProjection } from '$lib/models/workspace-local';
import type { JSONContent } from '@tiptap/core';
export type OutboxTable = 'outbox' | 'records' | 'receipts';
export interface OutboxTransaction<C, T> {
	entries(): Promise<readonly OutboxEntry<C, T>[]>;
	receipt(key: string): Promise<WriteReceipt<T> | null>;
	resource(key: string): Promise<ResourceState<T> | undefined>;
	allocate(draft: WriteDraft<C, T>): Promise<number>;
	removeAllocated(sequence: number): Promise<void>;
	replace(
		previous: readonly OutboxEntry<C, T>[],
		next: readonly OutboxEntry<C, T>[]
	): Promise<void>;
	putReceipt(key: string, receipt: WriteReceipt<T>): Promise<void>;
	putResource(key: string, entry: ResourceState<T>): Promise<void>;
}
export interface OutboxStorage<C, T> {
	readDraft(draft: WriteDraft<C, T>): WriteDraft<C, T>;
	receipt(accountId: string, key: string): Promise<WriteReceipt<T> | null>;
	snapshot(accountId: string): Promise<OutboxProjection<C, T>>;
	list(accountId: string): Promise<readonly OutboxEntry<C, T>[]>;
	transaction<R>(
		accountId: string,
		tables: readonly OutboxTable[],
		work: (tx: OutboxTransaction<C, T>) => Promise<R>
	): Promise<R>;
}
export interface CacheCheckpoint {
	readonly cursor: SyncCursor;
	readonly inventoryComplete: boolean;
}
export interface CacheTransaction<T> {
	resources(keys: readonly string[]): Promise<ReadonlyMap<string, ResourceState<T> | undefined>>;
	checkpoint(): Promise<CacheCheckpoint | null>;
	put(records: readonly CachedRecord<T>[]): Promise<void>;
	remove(keys: readonly string[]): Promise<void>;
	putCheckpoint(checkpoint: CacheCheckpoint): Promise<void>;
}
export interface CacheStorage<T> {
	load(accountId: string): Promise<StoredCache<T>>;
	transaction<R>(accountId: string, work: (tx: CacheTransaction<T>) => Promise<R>): Promise<R>;
}
export interface SyncReadTransport<T> {
	pull(since: SyncCursor): Promise<SyncPage<T>>;
	read(key: string, etag: SyncEtag | null): Promise<SyncObjectRead<T>>;
}
export interface OutboxTransport<C, T> {
	readonly recovery?: {
		observe(key: string): Promise<ServerResource<T>>;
		cancel(input: {
			operationId: string;
			baseEtag: SyncEtag | null;
			command: C;
		}): Promise<WriteRecovery<T>>;
	};
	send(input: {
		readonly operationId: string;
		readonly baseEtag: SyncEtag | null;
		readonly command: C;
	}): Promise<WriteOutcome<T>>;
}
export interface AccountWriterLock {
	tryRun<T>(
		accountId: string,
		work: () => Promise<T>
	): Promise<{ kind: 'acquired'; value: T } | { kind: 'busy' }>;
	run<T>(accountId: string, work: () => Promise<T>): Promise<T>;
}
export interface WorkspaceEditingEnvironment {
	now(): DateTime;
	operationId(): string;
	snapshot<T>(value: T): T;
	observe(start: () => void): () => void;
}
export interface WorkspaceLocalRepository<C, T> {
	read(accountId: string): Promise<WorkspaceLocalProjection<C, T>>;
	observe(
		accountId: string,
		changed: (projection: WorkspaceLocalProjection<C, T>) => void,
		failed: (error: Error) => void
	): () => void;
}
export interface NoteHistoryReader {
	list(noteId: NoteId): Promise<readonly NoteRevisionSummary[]>;
	read(noteId: NoteId, revisionId: NoteRevisionId): Promise<NoteRevision>;
}
export interface EditorRange {
	readonly from: number;
	readonly to: number;
}
export interface NoteEditorPort {
	getDocument(): ProseMirrorDocument;
	getPlainText(): string;
	scrollToHeading(id: string): void;
	holdInsertionPoint(runId: string, at: number): void;
	consumeInsertionPoint(runId: string): number | 'lost' | undefined;
	insertMermaid(at: number, source: string): boolean;
	replaceMermaid(previous: string, source: string): boolean;
	completeDrawioConversion(suggestion: SuggestionId, diagram: DiagramId): void;
	readonly active: boolean;
	initializeDocument(document: JSONContent): void;
	setDocument(document: JSONContent): void;
	focus(at: 'start' | 'end'): void;
	selection(): EditorRange | undefined;
	copySource(range: EditorRange | undefined): ClipboardSource | undefined;
	markdown(range: EditorRange | undefined): string | undefined;
	paste(content: ClipboardPaste, range: EditorRange | undefined): void;
	captureSelection(): EditorClipboardSelection | undefined;
	documentMatches(document: ProseMirrorDocument): boolean;
	deleteRange(range: EditorRange): void;
	collapseSelection(): void;
}
export interface EditorClipboardSelection {
	readonly document: ProseMirrorDocument;
	readonly range: EditorRange;
	readonly source: ClipboardSource;
}
export interface EditorDocumentCopy {
	copy(document: ProseMirrorDocument): JSONContent;
}
export interface NoteWorkspaceEditor {
	readonly port: NoteEditorPort;
	readonly state: NoteEditorState;
	readonly events: NoteEditorEvents;
}
export interface NoteEditorState {
	readonly documentGeneration: number;
	readonly active: boolean;
	readonly initialized: boolean;
	readonly holdingSelection: boolean;
	readonly contextRange: EditorRange | undefined;
	readonly reportedInsertions: Readonly<Record<string, number>>;
	initialize(): void;
	setInitialized(value: boolean): void;
	setHoldingSelection(value: boolean): void;
	rememberRange(range: EditorRange | undefined): void;
	reportInsertion(runId: string, position: number): void;
	releaseInsertion(runId: string): void;
	release(): void;
}
/** Rendering only; application notifications return to the UI event owner. */
export interface NoteEditorEvents {
	shimmer(indices: readonly number[]): void;
}
export interface NoteEditorView {
	readonly canCopy: boolean;
	readonly acceptsChanges: boolean;
}
export interface EditorInsertion {
	readonly runId: AgentRunId;
	readonly position: number;
}

/** Captured passive identity for an account-scoped history request. */
export interface NoteHistoryBinding {
	readonly accountId: string;
	readonly generation: number;
}

/** Readonly binding facts and guarded state updates; no session operations. */
export interface WorkspaceBindingState {
	readonly generation: number;
	readonly accountId: string | null;
	readonly startupError: string | null;
	readonly detach: (() => void) | null;
	refreshAt(generation: number, bootstrap: WorkspaceBootstrap): void;
	failAt(generation: number, message: string): void;
	clear(): void;
}
export interface WorkspaceAccountEnvironment {
	readonly accountId: string | null;
	readonly online: boolean;
	fetchBootstrap(): Promise<WorkspaceBootstrap>;
	saveBootstrap(bootstrap: WorkspaceBootstrap): void;
	reload(): void;
}

export interface CacheCommitDecision<T> {
	readonly put: readonly CachedRecord<T>[];
	readonly remove: readonly string[];
	readonly checkpoint: CacheCheckpoint | null;
}

/** Opaque mounted-editor identity; split panes receive distinct values. */
export interface NoteEditorIdentity {
	readonly key: symbol;
}
