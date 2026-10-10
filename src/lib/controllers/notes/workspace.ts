import { OutboxAccountChangedError } from '$lib/errors';
import type {
	AccountWriterLock,
	CacheStorage,
	NoteEditorIdentity,
	EditorDocumentCopy,
	NoteWorkspaceEditor,
	NoteHistoryReader,
	OutboxStorage,
	OutboxTable,
	OutboxTransaction,
	OutboxTransport,
	SyncReadTransport,
	WorkspaceAccountEnvironment,
	WorkspaceBindingState,
	WorkspaceEditingEnvironment,
	WorkspaceLocalRepository
} from '$lib/models/browser-workspace';
import type {
	Note,
	NoteId,
	NoteRevision,
	NoteRevisionId,
	ProseMirrorDocument,
	SectionNumberingLevel
} from '$lib/models/notes';
import type {
	DraftStatus,
	EditorSave,
	OutboxEntry,
	OutboxProjection,
	WriteConflictView,
	WriteContent,
	WriteDraft,
	WriteOutcome,
	WriteReceipt
} from '$lib/models/outbox';
import {
	initialSyncCursor,
	type CacheAccess,
	type CacheCommit,
	type ResourceState,
	type StoredCache,
	type SubmissionResult,
	type SyncEtag,
	type SynchronizationResult,
	type SyncLane,
	type SyncScheduler,
	type SyncSnapshot,
	type TransferState
} from '$lib/models/sync';
import { widgetCatalog, type WidgetCandidateReader } from '$lib/models/widgets';
import type { DateTime } from '$lib/models/workspace';
import type {
	StagedWrite,
	WorkspaceEditContext,
	WorkspaceSave
} from '$lib/models/workspace-editing';
import type { WorkspaceLocalProjection } from '$lib/models/workspace-local';
import type { PreparedWorkspaceCommand, WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { NoteDocumentPresentation } from '$lib/services/notes/document-presentation';
import type { NoteEditingRules } from '$lib/services/notes/editing';
import type { NoteSectionNumbering } from '$lib/services/notes/section-numbering';
import type { IWriteAncestryService } from '$lib/services/sync/ancestry';
import type { IWorkspaceFieldReplayService } from '$lib/services/sync/rebase';
import type { ISyncSchedulingService } from '$lib/services/sync/scheduling';
import type { ICacheCommitService } from '$lib/services/sync/state';
import {
	accessCache,
	accessMessage,
	cachedSnapshot,
	compareSyncEtags,
	localResource,
	receiveResource,
	resourceCurrent,
	resourceVersion,
	visibleResources,
	type IOutboxDeliveryService,
	type IOutboxEditingService
} from '$lib/services/sync/state';
import type { IWidgetEditingService } from '$lib/services/widgets/edits';
import type { IWidgetPatchService } from '$lib/services/widgets/patches';
import {
	assertWorkspaceWriteIdentity,
	mutationResource,
	workspaceResourceKey
} from '$lib/services/workspace/commands';
import type { IWorkspaceDraftService } from '$lib/services/workspace/draft';
import type { ResourceCacheStateAccess } from '$lib/stores/sync/cache';
import type { SyncExecutionStateAccess } from '$lib/stores/sync/execution';
import type { MutationQueueStateAccess } from '$lib/stores/sync/submission';
import type { WorkspaceCapabilityRegistry } from '$lib/stores/workspace/capabilities';
import type { WorkspaceDraftStateAccess } from '$lib/stores/workspace/draft.svelte';
import type { EditorSessionStore } from '$lib/stores/workspace/editor-session.svelte';
import type { WorkspaceProjectionStateAccess } from '$lib/stores/workspace/projection.svelte';
import type { WorkspaceResourceStateAccess } from '$lib/stores/workspace/resources.svelte';

export interface NoteWorkspaceState {
	readonly active: boolean;
	readonly note: Note | null;
	readonly publishing: boolean;
	readonly cancelAutosave: (() => void) | null;
	setNote(note: Note): void;
	setPublishing(value: boolean): void;
	setAutosave(cancel: (() => void) | null): void;
	release(): void;
}
export interface NoteWorkspaceRevisions extends NoteHistoryReader {
	restore(noteId: NoteId, revisionId: NoteRevisionId): Promise<void>;
}
export interface NoteWorkspaceFeedback {
	error(message: string): void;
	success(message: string): void;
	info(message: string): void;
}
export interface NoteWorkspaceRules {
	noteHasUnpublishedChanges(note: Note, commands: readonly WorkspaceCommand[]): boolean;
}
export interface NoteWorkspaceDependencies {
	readonly state: NoteWorkspaceState;
	readonly draftRules: IWorkspaceDraftService;
	readonly noteId: NoteId;
	readonly binding: {
		readonly state: WorkspaceBindingState;
		readonly environment: WorkspaceAccountEnvironment;
		readonly generation: number;
		readonly dispose: () => void;
	};
	readonly account: NoteWorkspaceAccount;
	readonly draftState: WorkspaceDraftStateAccess;
	readonly environment: WorkspaceEditingEnvironment;
	readonly sessionState: EditorSessionStore;
	readonly noteEditing: NoteEditingRules;
	readonly sections: NoteSectionNumbering;
	readonly presentation: NoteDocumentPresentation;
	readonly documents: EditorDocumentCopy;
	readonly editorIdentity: () => NoteEditorIdentity | undefined;
	readonly editors: WorkspaceCapabilityRegistry<NoteWorkspaceEditor>;

	readonly revisions: NoteWorkspaceRevisions;
	readonly feedback: NoteWorkspaceFeedback;
	readonly scheduler: SyncScheduler;
	readonly rules: NoteWorkspaceRules;
	readonly conflictChanged: (open: boolean) => void;
}
export interface NoteWorkspaceController {
	readonly note: Note;
	readonly dirty: boolean;
	readonly saveFailed: boolean;
	readonly publishing: boolean;
	readonly unsynced: boolean;
	readonly hasUnpublishedChanges: boolean;
	readonly sync: {
		readonly status: DraftStatus;
		readonly lastError: string | undefined;
		readonly conflict: WriteConflictView<Note> | undefined;
	};
	open(): void;
	close(): void;
	changed(): void;
	titleChanged(title: string): void;
	placementChanged(parentId: NoteId | undefined, position: number): void;
	adoptNewer(): void;
	reconcileSaved(observed: Note): void;
	save(options?: { auto?: boolean }): Promise<void>;
	ensureSynchronized(message: string): Promise<boolean>;
	togglePin(): Promise<void>;
	numbering(level: SectionNumberingLevel): Promise<void>;
	publish(): Promise<void>;
	restoreRevision(revisionId: NoteRevisionId): Promise<boolean>;
	discardDraft(): Promise<void | { kind: 'failure' }>;
	retrySync(): Promise<void>;
	useRemoteVersion(): Promise<void>;
	keepLocalVersion(): Promise<void>;
}
/** Account capabilities contain mechanisms and state, never controller instances. */
export interface NoteWorkspaceAccount {
	readonly accountId: string;
	readonly repository: WorkspaceLocalRepository<WorkspaceCommand, WorkspaceRecord>;
	readonly outbox: OutboxStorage<WorkspaceCommand, WorkspaceRecord>;
	readonly cacheStorage: CacheStorage<WorkspaceRecord>;
	readonly readTransport: SyncReadTransport<WorkspaceRecord>;
	readonly writeTransport: OutboxTransport<WorkspaceCommand, WorkspaceRecord>;
	readonly writerLock: AccountWriterLock;
	readonly scheduler: SyncScheduler;
	readonly resourceState: WorkspaceResourceStateAccess;
	readonly projectionState: WorkspaceProjectionStateAccess;
	readonly cacheState: ResourceCacheStateAccess<WorkspaceRecord>;
	readonly queueState: MutationQueueStateAccess<WorkspaceCommand, WorkspaceRecord>;
	readonly executionState: SyncExecutionStateAccess;
	readonly ancestry: IWriteAncestryService;
	readonly cacheMerge: ICacheCommitService;
	readonly editing: IOutboxEditingService;
	readonly delivery: IOutboxDeliveryService;
	readonly scheduling: ISyncSchedulingService;
	readonly fields: IWorkspaceFieldReplayService;
	readonly widgetPatches: IWidgetPatchService;
	readonly widgetReader: WidgetCandidateReader;
	readonly widgetEditing: IWidgetEditingService;
}
type NoteCommand = Extract<
	PreparedWorkspaceCommand,
	{ kind: 'saveNote' | 'noteNumbering' | 'publishNote' }
>;
type DraftCommand = NoteCommand | { kind: 'discardPublished'; revision: NoteRevision };
type WorkspaceSaveResult = Promise<WorkspaceSave<'notes'>>;

/** Complete note operations over shared account state, pure rules and raw I/O mechanisms. */
export class NoteWorkspace implements NoteWorkspaceController {
	constructor(private readonly dependencies: NoteWorkspaceDependencies) {}
	private get active(): boolean {
		return this.dependencies.state.active && this.draftActive;
	}
	get note(): Note {
		const note = this.dependencies.state.note;
		if (!note) throw new Error('Open the note workspace before reading it');
		return note;
	}
	get dirty(): boolean {
		return this.sessionDirty;
	}
	get saveFailed(): boolean {
		return this.sessionFailure !== null;
	}
	get publishing(): boolean {
		return this.dependencies.state.publishing;
	}
	get sync(): NoteWorkspaceController['sync'] {
		return {
			status: this.draftStatus,
			lastError: this.draftLastError,
			conflict: this.draftConflict
		};
	}
	get unsynced(): boolean {
		return ['pending', 'conflict', 'error'].includes(this.draftStatus);
	}
	get hasUnpublishedChanges(): boolean {
		const { rules } = this.dependencies;
		return rules.noteHasUnpublishedChanges(
			this.note,
			this.resourcePending.map((entry) => entry.intent.command)
		);
	}
	open(): void {
		if (!this.active || this.dependencies.state.note) return;
		this.dependencies.state.setNote({ ...this.draftAdopt() });
		this.reportConflict();
	}
	close(): void {
		this.cancelAutosave();
		this.dependencies.state.setPublishing(false);
		this.sessionClose();
		this.dependencies.state.release();
	}
	private cancelAutosave(): void {
		this.dependencies.state.cancelAutosave?.();
		this.dependencies.state.setAutosave(null);
	}
	changed(): void {
		if (!this.active) return;
		this.sessionChanged();
		this.cancelAutosave();
		const { scheduler, state } = this.dependencies;
		state.setAutosave(scheduler.schedule(scheduler.now() + 2000, () => this.save({ auto: true })));
	}
	titleChanged(title: string): void {
		if (!this.active) return;
		this.dependencies.state.setNote({ ...this.note, title });
		this.changed();
	}
	placementChanged(parentId: NoteId | undefined, position: number): void {
		if (this.active) this.dependencies.state.setNote({ ...this.note, parentId, position });
	}
	adoptNewer(): void {
		if (!this.active || !this.draftNewer || this.dirty) return;
		this.replace(this.draftAdopt(), this.note.document);
	}
	/** Acknowledgements update revision metadata without touching selection or undo. */
	reconcileSaved(observed: Note): void {
		const { state } = this.dependencies;
		if (!this.active || this.dirty || this.draftStatus !== 'synced') return;
		if (observed.id !== this.note.id) throw new Error('The saved note belongs to another pane');
		if (this.draftNewer) {
			this.adoptNewer();
			return;
		}
		if (
			observed.currentRevision === this.note.currentRevision &&
			observed.publishedRevision === this.note.publishedRevision &&
			observed.publishedAt === this.note.publishedAt &&
			observed.updatedAt === this.note.updatedAt
		)
			return;
		const acknowledged = this.draftAdopt();
		state.setNote({
			...this.note,
			currentRevision: acknowledged.currentRevision,
			publishedRevision: acknowledged.publishedRevision,
			publishedAt: acknowledged.publishedAt,
			updatedAt: acknowledged.updatedAt
		});
	}

	private replace(note: Note, previous?: Note['document']): void {
		if (!this.active) return;
		this.cancelAutosave();
		this.sessionAccept(() => {
			this.dependencies.state.setNote({ ...note });
			this.replaceEditorDocument(note.document, previous);
		});
	}
	private reportConflict(): void {
		if (this.active) this.dependencies.conflictChanged(this.draftStatus === 'conflict');
	}
	async save(options: { auto?: boolean } = {}): Promise<void> {
		const { state, feedback } = this.dependencies;
		if (!this.active || !this.mountedEditor()) return;
		if (!this.dirty) {
			if (!options.auto && this.unsynced) await this.retrySync();
			return;
		}
		if (!this.note.title.trim()) {
			if (!options.auto) feedback.error('Give the note a title first.');
			return;
		}
		this.cancelAutosave();
		await this.sessionSave(
			async () => {
				const current = this.mountedEditor();
				if (!current) return { kind: 'failure', message: 'The editor is unavailable' };
				return this.editingSave({
					...this.note,
					title: this.note.title.trim(),
					document: current.port.getDocument(),
					plainText: current.port.getPlainText()
				});
			},
			(value, unchanged) => {
				state.setNote(
					unchanged
						? { ...value }
						: { ...this.note, currentRevision: value.currentRevision, updatedAt: value.updatedAt }
				);
				this.reportConflict();
			}
		);
		if (this.active && this.sessionFailure && !options.auto) feedback.error(this.sessionFailure);
	}
	async ensureSynchronized(message: string): Promise<boolean> {
		if (!this.active) return false;
		if (this.dirty) await this.save({ auto: true });
		if (!this.active) return false;
		if (this.dirty || this.draftStatus !== 'synced') {
			this.dependencies.feedback.error(message);
			return false;
		}
		return true;
	}
	async numbering(level: SectionNumberingLevel): Promise<void> {
		if (!this.active) return;
		const { feedback, state } = this.dependencies;
		const current = this.sessionCheckpoint();
		const result = await this.editingNumbering(level);
		if (!current()) return;
		if (result.kind === 'failure') feedback.error(result.message);
		else state.setNote({ ...this.note, sectionNumbering: result.value.sectionNumbering });
	}
	async togglePin(): Promise<void> {
		const { state, feedback } = this.dependencies;
		if (!this.active || !this.mountedEditor()) return;
		if (this.dirty) await this.save({ auto: true });
		const currentEditor = this.mountedEditor();
		if (!this.active || this.dirty || !currentEditor) return;
		const current = this.sessionCheckpoint();
		const result = await this.editingTogglePin({
			...this.note,
			document: currentEditor.port.getDocument(),
			plainText: currentEditor.port.getPlainText()
		});
		if (!current()) return;
		if (result.kind === 'failure') {
			feedback.error('Could not update pin. Try again.');
			return;
		}
		state.setNote({ ...result.value });
		this.sessionAccept();
		this.reportConflict();
		feedback.success(this.note.isPinned ? 'Pinned' : 'Unpinned');
		if (this.draftStatus === 'synced') await this.synchronizeAccount();
	}
	async publish(): Promise<void> {
		const { state, feedback } = this.dependencies;
		if (!this.active || this.publishing) return;
		state.setPublishing(true);
		try {
			if (this.dirty) await this.save();
			if (!this.active) return;
			if (this.dirty || this.draftStatus === 'error' || this.draftStatus === 'conflict') {
				feedback.error('Save or resolve the note before publishing.');
				return;
			}
			const current = this.sessionCheckpoint();
			const result = await this.draftStage({ kind: 'publishNote', noteId: this.note.id });
			if (!current()) return;
			if (result.kind === 'failure') {
				feedback.error(result.message);
				return;
			}
			if (!result.value) {
				feedback.error('The note no longer exists');
				return;
			}
			state.setNote({
				...this.note,
				publishedRevision: result.value.publishedRevision,
				publishedAt: result.value.publishedAt
			});
			feedback.success('Publication saved on this device');
		} finally {
			if (this.active) state.setPublishing(false);
		}
	}
	async retrySync(): Promise<void> {
		if (!this.active) return;
		const { state, feedback } = this.dependencies;
		const current = this.sessionCheckpoint();
		await this.draftRetry();
		if (!this.active) return;
		const local = this.draftValue;
		if (!local) {
			feedback.error(this.draftLastError ?? 'This resource is unavailable');
			return;
		}
		if (current() && !this.dirty) state.setNote({ ...local });
		this.reportConflict();
		if (this.draftStatus === 'synced') await this.synchronizeAccount();
		else if (this.draftLastError) feedback.error(this.draftLastError);
	}
	async useRemoteVersion(): Promise<void> {
		if (!this.active) return;

		const remote = await this.draftDiscard(this.sessionCheckpoint());
		if (!this.active || remote.kind === 'superseded') return;
		if (remote.kind !== 'ready') throw new Error('The server copy is unavailable');
		this.replace(remote.value);
		await this.synchronizeAccount();
	}
	async keepLocalVersion(): Promise<void> {
		if (!this.active) return;
		const { state } = this.dependencies;
		const current = this.sessionCheckpoint();
		await this.draftKeep();
		if (!current() || this.dirty) return;
		const local = this.draftValue;
		if (!local) throw new Error('The local edit is unavailable');
		state.setNote({ ...local });
		this.reportConflict();
		if (this.draftStatus === 'synced') await this.synchronizeAccount();
	}
	private async reopen(current: () => boolean): Promise<boolean> {
		const opened = await this.draftRead(current);
		if (!this.active) return false;
		if (opened.kind === 'superseded') {
			this.dependencies.feedback.info(
				'The server version changed. Your later edits are retained for review.'
			);
			return false;
		}
		if (opened.kind !== 'ready') throw new Error('The saved note could not be reopened');
		this.replace(opened.value);
		return true;
	}
	async restoreRevision(revisionId: NoteRevisionId): Promise<boolean> {
		if (!(await this.ensureSynchronized('Sync the note before restoring a version.'))) return false;
		const { revisions, feedback } = this.dependencies;
		const result = await this.attempt(async () => {
			const current = this.sessionCheckpoint();
			await revisions.restore(this.note.id, revisionId);
			if (!this.active) return;
			await this.synchronizeAccount();
			if (await this.reopen(current)) feedback.success('Restored that version');
		});
		if (result.kind === 'failure') {
			if (this.active) feedback.error('Could not restore that version. Try again.');
			return false;
		}
		return this.active;
	}
	async discardDraft(): Promise<void | { kind: 'failure' }> {
		if (!this.active || this.note.publishedRevision === 0) return;
		if (!(await this.ensureSynchronized('Save the note before discarding changes.'))) return;
		const { revisions, feedback } = this.dependencies;
		const result = await this.attempt(async () => {
			const current = this.sessionCheckpoint();
			const observed = this.note;
			const history = await revisions.list(observed.id);
			const published = history.find(
				(revision) => revision.revision === observed.publishedRevision
			);
			if (!published) throw new Error('The published version is unavailable');
			const revision = await revisions.read(observed.id, published.id);
			if (!current()) return;
			const saved = await this.draftDiscardPublished(revision);
			if (saved.kind === 'failure') throw new Error(saved.message);
			if (!(await this.reopen(current))) return;
			feedback.success('Reverted to last published version');
			await this.synchronizeAccount();
		});
		if (result.kind === 'failure') {
			if (this.active) feedback.error('Could not discard changes. Try again.');
			return result;
		}
	}
	private async attempt(
		work: () => Promise<void>
	): Promise<{ kind: 'success' } | { kind: 'failure' }> {
		try {
			await work();
			return { kind: 'success' };
		} catch {
			return { kind: 'failure' };
		}
	}
	private outboxSnapshot(accountId: string) {
		return this.dependencies.account.outbox.snapshot(accountId);
	}
	private outboxList(accountId: string) {
		return this.dependencies.account.outbox.list(accountId);
	}
	private async outboxAppend(
		accountId: string,
		draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>
	): Promise<string> {
		draft = this.dependencies.account.outbox.readDraft(draft);
		return this.outboxChange(accountId, ['outbox', 'records', 'receipts'], async (entries, tx) => {
			const receipt = await tx.receipt(draft.key);
			const rebased = this.ancestryDraft(entries, draft, receipt);
			const current = await tx.resource(draft.key);
			const snapshot = cachedSnapshot(current);
			const observed =
				current?.kind === 'deleted'
					? current
					: snapshot
						? { kind: 'found' as const, snapshot }
						: { kind: 'unavailable' as const };
			// IndexedDB allocates order in the same transaction as the final intent. An abort also rolls back allocation.
			const sequence = await tx.allocate(rebased);
			const next = this.dependencies.account.editing.append(
				entries,
				rebased,
				sequence,
				receipt,
				observed
			);
			const appended = next.find((entry) => entry.intent.operationId === draft.operationId);
			if (!appended) throw new Error('The queued resource was not appended');
			if (appended.sequence !== sequence) await tx.removeAllocated(sequence);
			return { entries: next, result: appended.intent.operationId };
		});
	}
	private async outboxKeepLocal(
		accountId: string,
		operationId: string,
		replacementId: string
	): Promise<void> {
		return this.outboxChange(accountId, ['outbox'], async (entries) => ({
			entries: this.dependencies.account.editing.keepLocal(entries, operationId, replacementId),
			result: undefined
		}));
	}
	private async outboxDiscard(accountId: string, operationIds: readonly string[]): Promise<void> {
		return this.outboxChange(accountId, ['outbox'], async (entries) => ({
			entries: this.dependencies.account.editing.discard(entries, operationIds),
			result: undefined
		}));
	}
	private async outboxTake(
		accountId: string,
		excluded: ReadonlySet<string> = new Set()
	): Promise<OutboxEntry<WorkspaceCommand, WorkspaceRecord> | null> {
		return this.outboxChange(accountId, ['outbox'], async (entries) => {
			const next = this.dependencies.account.delivery.next(entries, excluded);
			if (!next) return { entries, result: null };
			const sent = this.dependencies.account.delivery.begin(next);
			return { entries: entries.map((entry) => (entry === next ? sent : entry)), result: sent };
		});
	}
	private async outboxRetry(
		accountId: string,
		operationId: string,
		message: string
	): Promise<void> {
		return this.outboxChange(accountId, ['outbox'], async (entries) => ({
			entries: entries.map((entry) =>
				entry.intent.operationId === operationId
					? this.dependencies.account.delivery.fail(entry, message)
					: entry
			),
			result: undefined
		}));
	}
	private async outboxRecover(accountId: string): Promise<void> {
		return this.outboxChange(accountId, ['outbox'], async (entries) => ({
			entries: entries.map((entry) =>
				this.dependencies.account.delivery.fail(
					entry,
					'Interrupted submission; checking its operation proof'
				)
			),
			result: undefined
		}));
	}
	private async outboxSettle(
		accountId: string,
		sent: OutboxEntry<WorkspaceCommand, WorkspaceRecord>,
		outcome: WriteOutcome<WorkspaceRecord>
	): Promise<void> {
		return this.outboxChange(accountId, ['outbox', 'records', 'receipts'], async (entries, tx) => {
			const settled = this.dependencies.account.delivery.settle(
				entries,
				sent.intent.operationId,
				outcome
			);
			const next =
				outcome.kind === 'conflict'
					? this.ancestryConflicted(settled, sent.intent.operationId)
					: settled;
			if (outcome.kind === 'applied') {
				const previous = await tx.receipt(sent.intent.key);
				const receipt = this.dependencies.account.delivery.retainReceipt(previous, outcome.receipt);
				await tx.putReceipt(sent.intent.key, receipt);
			}
			const resource = this.dependencies.account.delivery.authoritativeResource(outcome);
			if (resource) await this.outboxSaveResource(sent.intent.key, resource, tx);
			return { entries: next, result: undefined };
		});
	}
	private async outboxSaveResource(
		key: string,
		resource: WriteReceipt<WorkspaceRecord>['resource'],
		tx: OutboxTransaction<WorkspaceCommand, WorkspaceRecord>
	): Promise<void> {
		const current = await tx.resource(key);
		await tx.putResource(
			key,
			receiveResource(current, resource.kind === 'found' ? resource.snapshot : resource)
		);
	}
	private outboxChange<R>(
		accountId: string,
		tables: readonly OutboxTable[],
		work: (
			entries: readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[],
			tx: OutboxTransaction<WorkspaceCommand, WorkspaceRecord>
		) => Promise<{ entries: readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[]; result: R }>
	): Promise<R> {
		return this.dependencies.account.outbox.transaction(accountId, tables, async (tx) => {
			const previous = await tx.entries();
			const change = await work(previous, tx);
			await tx.replace(previous, change.entries);
			return change.result;
		});
	}
	private async persistenceCommit(
		accountId: string,
		changes: CacheCommit<WorkspaceRecord>
	): Promise<void> {
		await this.dependencies.account.cacheStorage.transaction(accountId, async (tx) => {
			const keys = [...changes.put.map((row) => row.key), ...changes.remove.map((row) => row.key)];
			const previous = await tx.resources(keys);
			const checkpoint = changes.cursor === undefined ? null : await tx.checkpoint();
			const decision = this.dependencies.account.cacheMerge.decide(previous, checkpoint, changes);
			await tx.put(decision.put);
			await tx.remove(decision.remove);
			if (decision.checkpoint) await tx.putCheckpoint(decision.checkpoint);
		});
	}
	private cacheSubscribe(listener: () => void): () => void {
		return this.dependencies.account.cacheState.subscribe(listener);
	}
	private get cacheStatus(): SynchronizationResult {
		return this.dependencies.account.cacheState.read().result;
	}
	private cacheAccess(key: string): CacheAccess<WorkspaceRecord> {
		if (this.dependencies.account.cacheState.read().stopped) return { kind: 'unavailable' };
		return accessCache(
			this.cacheEntry(key),
			this.dependencies.account.cacheState.read().online,
			this.cacheTransfer(key)
		);
	}
	private cacheInitialize(): Promise<void> {
		const existing = this.dependencies.account.cacheState.read().initializing;
		if (existing) return existing;
		const initializing = this.cacheRestore().catch((error) => {
			this.dependencies.account.cacheState.update({ initializing: null });
			throw error;
		});
		this.dependencies.account.cacheState.update({ initializing });
		return initializing;
	}
	private async cacheReload(): Promise<void> {
		await this.cacheInitialize();
		await this.cacheRestore();
	}
	private cacheRefresh(): Promise<SynchronizationResult> {
		const existing = this.dependencies.account.cacheState.read().checking;
		if (existing) return existing;
		const checking = this.cachePullChanges().finally(() => {
			if (this.dependencies.account.cacheState.read().checking !== checking) return;
			this.dependencies.account.cacheState.update({ checking: null });
		});
		this.dependencies.account.cacheState.update({ checking });
		return checking;
	}
	private async cacheOpen(key: string): Promise<CacheAccess<WorkspaceRecord>> {
		try {
			await this.cacheInitialize();
			const current = this.cacheAccess(key);
			if (
				current.kind === 'ready' ||
				current.kind === 'deleted' ||
				!this.dependencies.account.cacheState.read().online ||
				this.dependencies.account.cacheState.read().stopped
			)
				return current;
			const result = await this.cacheWaitForRead(key);
			if (result.kind === 'failure' || result.kind === 'unavailable') return result;
			const after = this.cacheAccess(key);
			return after.kind === 'wait' ? this.cacheOpen(key) : after;
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Local storage failed'
			};
		}
	}
	private cacheEntry(key: string): ResourceState<WorkspaceRecord> | undefined {
		return this.dependencies.account.cacheState.read().entries.get(key);
	}
	private cacheTransfer(key: string): TransferState | undefined {
		const attempt = this.dependencies.account.cacheState.attempts().get(key);
		return !resourceCurrent(this.cacheEntry(key)) &&
			this.cacheEntry(key)?.kind !== 'deleted' &&
			attempt?.target === resourceVersion(this.cacheEntry(key))
			? attempt?.transfer
			: undefined;
	}
	private cacheNotify(): void {
		for (const listener of this.dependencies.account.cacheState.listeners()) listener();
	}
	private async cacheRestore(): Promise<void> {
		const generation = this.dependencies.account.cacheState.read().readGeneration + 1;
		this.dependencies.account.cacheState.update({ readGeneration: generation });
		const stored = await this.dependencies.account.cacheStorage.load(
			this.dependencies.account.accountId
		);
		if (generation === this.dependencies.account.cacheState.read().readGeneration)
			this.cacheApplyStored(stored);
	}
	private cacheApplyStored(
		{ records, cursor, inventoryComplete }: StoredCache<WorkspaceRecord>,
		notify = true
	): void {
		if (this.dependencies.account.cacheState.read().stopped) return;
		this.dependencies.account.cacheState.update({
			readGeneration: this.dependencies.account.cacheState.read().readGeneration + 1,
			initializing: this.dependencies.account.cacheState.read().initializing ?? Promise.resolve(),
			cursor,
			inventoryComplete,
			entries: new Map(records.map(({ key, entry }) => [key, entry]))
		});
		for (const key of this.dependencies.account.cacheState.attempts().keys())
			if (!this.cacheTransfer(key)) this.dependencies.account.cacheState.removeAttempt(key);
		if (notify) this.cacheNotify();
	}
	private async cacheCommit(compute: () => CacheCommit<WorkspaceRecord>): Promise<void> {
		if (this.dependencies.account.cacheState.read().stopped) return;
		await this.persistenceCommit(this.dependencies.account.accountId, {
			...compute()
		});
		await this.cacheRestore();
	}
	private async cachePullChanges(): Promise<SynchronizationResult> {
		try {
			await this.cacheReload();
			if (this.dependencies.account.cacheState.read().stopped) return { kind: 'stopped' };
			if (!this.dependencies.account.cacheState.read().online) return { kind: 'offline' };
			let more: boolean;
			do {
				const before = this.dependencies.account.cacheState.read().cursor ?? initialSyncCursor;
				const batch = await this.dependencies.account.readTransport.pull(before);
				more = batch.hasMore;
				if (more && BigInt(batch.cursor) <= BigInt(before))
					throw new Error('The server page did not advance its checkpoint');
				await this.cacheCommit(() => {
					if (
						BigInt(batch.cursor) <
						BigInt(this.dependencies.account.cacheState.read().cursor ?? initialSyncCursor)
					)
						throw new Error('The server change cursor moved backwards');
					const put = batch.records.map(({ key, resource }) => ({
						key,
						entry: receiveResource<WorkspaceRecord>(
							undefined,
							resource.kind === 'found' ? resource.snapshot : resource
						)
					}));
					return {
						put,
						remove: [],
						cursor: batch.cursor,
						inventoryComplete:
							this.dependencies.account.cacheState.read().inventoryComplete || !more
					};
				});
				if (!this.dependencies.account.cacheState.read().online) return { kind: 'offline' };
			} while (more && !this.dependencies.account.cacheState.read().stopped);
			if (this.dependencies.account.cacheState.read().stopped) return { kind: 'stopped' };
			this.dependencies.account.cacheState.update({ result: { kind: 'complete' } });
			this.cacheNotify();
			return this.dependencies.account.cacheState.read().result;
		} catch (error) {
			if (this.dependencies.account.cacheState.read().stopped) return { kind: 'stopped' };
			const message = error instanceof Error ? error.message : 'Change synchronization failed';
			this.dependencies.account.cacheState.update({ result: { kind: 'failure', message } });
			this.cacheNotify();
			return { kind: 'failure', message };
		}
	}
	private cacheFetch(key: string): Promise<SynchronizationResult> {
		const existing = this.dependencies.account.cacheState.fetching(key);
		if (existing) return existing;
		const request = this.cacheRead(key).finally(() =>
			this.dependencies.account.cacheState.removeFetching(key)
		);
		this.dependencies.account.cacheState.setFetching(key, request);
		return request;
	}
	private async cacheWaitForRead(key: string): Promise<SynchronizationResult> {
		const interrupted = Promise.withResolvers<SynchronizationResult>();
		const unsubscribe = this.cacheSubscribe(() => {
			if (this.dependencies.account.cacheState.read().stopped)
				interrupted.resolve({ kind: 'stopped' });
			else if (!this.dependencies.account.cacheState.read().online)
				interrupted.resolve({ kind: 'offline' });
		});
		try {
			return await Promise.race([this.cacheFetch(key), interrupted.promise]);
		} finally {
			unsubscribe();
		}
	}
	private async cacheRead(key: string): Promise<SynchronizationResult> {
		try {
			const response = await this.dependencies.account.readTransport.read(key, null);
			if (this.dependencies.account.cacheState.read().stopped) return { kind: 'stopped' };
			if (response.kind === 'unchanged') throw new Error('An uncached read returned no body');
			if (response.kind === 'unavailable') {
				this.dependencies.account.cacheState.setAttempt(key, {
					target: resourceVersion(this.cacheEntry(key)),
					transfer: { kind: 'missing' }
				});
				this.cacheNotify();
				return { kind: 'unavailable' };
			}
			await this.cacheCommit(() => ({
				put: [
					{
						key,
						entry: receiveResource<WorkspaceRecord>(
							undefined,
							response.kind === 'found' ? response.snapshot : response
						)
					}
				],
				remove: []
			}));
			this.dependencies.account.cacheState.removeAttempt(key);
			return { kind: 'complete' };
		} catch (error) {
			if (this.dependencies.account.cacheState.read().stopped) return { kind: 'stopped' };
			const message =
				error instanceof Error ? error.message : 'The resource could not be downloaded';
			this.dependencies.account.cacheState.setAttempt(key, {
				target: resourceVersion(this.cacheEntry(key)),
				transfer: { kind: 'failed', message }
			});
			this.cacheNotify();
			return { kind: 'failure', message };
		}
	}
	private get executionOnline(): boolean {
		return this.dependencies.account.executionState.online;
	}
	private get executionStopped(): boolean {
		return this.dependencies.account.executionState.stopped;
	}
	private get executionFailure(): string | null {
		for (const lane of Object.values(this.executionLanes()))
			if (lane.result.kind === 'failure') return lane.result.message;
		return null;
	}
	private executionSetOnline(online: boolean): void {
		if (this.executionStopped) return;
		this.dependencies.account.executionState.setOnline(online);
		this.executionSchedule();
	}
	private executionRetryNow(): void {
		if (this.executionStopped) return;
		for (const [id, retry] of this.dependencies.account.executionState.writeRetries())
			this.dependencies.account.executionState.setWriteRetry(id, { ...retry, at: 0 });
		for (const lane of ['pull', 'writes'] as const)
			this.dependencies.account.executionState.updateLane(lane, { retry: null });
	}
	private executionExcludedWrites(): ReadonlySet<string> {
		return this.dependencies.account.scheduling.excludedWrites(
			this.dependencies.account.executionState.writeRetries(),
			this.dependencies.account.scheduler.now()
		);
	}
	private executionDeferWrite(id: string): void {
		if (this.executionStopped) return;
		const attempts =
			(this.dependencies.account.executionState.writeRetries().get(id)?.attempts ?? 0) + 1;
		this.dependencies.account.executionState.setWriteRetry(id, {
			attempts,
			at: this.dependencies.account.scheduling.retryAt(
				attempts,
				this.dependencies.account.scheduler.now()
			)
		});
	}
	private executionClearWriteRetry(id: string): void {
		this.dependencies.account.executionState.deleteWriteRetry(id);
	}
	private executionRetainWriteRetries(ids: ReadonlySet<string>): void {
		for (const id of this.dependencies.account.executionState.writeRetries().keys())
			if (!ids.has(id)) this.dependencies.account.executionState.deleteWriteRetry(id);
	}
	private async executionSynchronize(force = false): Promise<void> {
		if (force) this.executionRetryNow();
		await Promise.all([this.executionRequest('pull'), this.executionRequest('writes')]);
	}
	private executionCommitted(): void {
		void this.executionRequest('pull');
	}
	private executionChanged(): void {
		if (this.executionStopped) return;
		this.dependencies.account.executionState.updateLane('writes', { retry: null });
		void this.executionRequest('writes');
	}
	private executionLanes() {
		return {
			pull: this.dependencies.account.executionState.lane('pull'),
			writes: this.dependencies.account.executionState.lane('writes')
		};
	}
	private executionRequest(lane: SyncLane): Promise<void> {
		if (this.executionStopped) return Promise.resolve();
		this.dependencies.account.executionState.updateLane(lane, { requested: true });
		const state = this.dependencies.account.executionState.lane(lane);
		if (this.executionStopped || !this.executionOnline) return Promise.resolve();
		if (state.retry !== null && state.retry > this.dependencies.account.scheduler.now())
			return Promise.resolve();
		if (state.running) return state.running;
		const running = Promise.resolve()
			.then(async () => {
				await this.executionRun(lane);
			})
			.finally(() => {
				if (
					this.dependencies.account.executionState.lane(lane).running !== running ||
					this.dependencies.account.executionState.stopped
				)
					return;
				this.dependencies.account.executionState.updateLane(lane, { running: null });
				this.executionSchedule();
				const latest = this.dependencies.account.executionState.lane(lane);
				if (
					latest.requested &&
					latest.retry === null &&
					!this.executionStopped &&
					this.executionOnline
				)
					void this.executionRequest(lane);
			});
		this.dependencies.account.executionState.updateLane(lane, { running });
		return running;
	}
	private async executionRun(lane: SyncLane): Promise<void | { kind: 'failure' }> {
		do {
			this.dependencies.account.executionState.updateLane(lane, { requested: false, retry: null });
			let operationFailure = false;
			try {
				if (this.executionStopped || !this.executionOnline) return;
				const result = await (lane === 'pull' ? this.cacheRefresh() : this.queueSubmit());
				if (this.executionStopped) return;
				this.dependencies.account.executionState.updateLane(lane, { result });
				if (result.kind === 'failure') {
					operationFailure =
						lane === 'writes' && this.dependencies.account.executionState.writeRetries().size > 0;
					throw new Error(result.message);
				}
				if (result.kind === 'waiting') this.executionDeferLane(lane);
				else this.dependencies.account.executionState.updateLane(lane, { failures: 0 });
				this.accountFailureChanged();
			} catch (error) {
				if (this.executionStopped) return;
				this.dependencies.account.executionState.updateLane(lane, {
					result: {
						kind: 'failure',
						message: error instanceof Error ? error.message : 'Workspace synchronization failed'
					}
				});
				if (!operationFailure) this.executionDeferLane(lane);
				this.accountFailureChanged();
				return { kind: 'failure' };
			}
		} while (
			this.dependencies.account.executionState.lane(lane).requested &&
			!this.executionStopped &&
			this.executionOnline
		);
	}
	private executionDeferLane(lane: SyncLane): void {
		const failures = this.dependencies.account.executionState.lane(lane).failures + 1;
		this.dependencies.account.executionState.updateLane(lane, {
			failures,
			retry: this.dependencies.account.scheduling.retryAt(
				failures,
				this.dependencies.account.scheduler.now()
			)
		});
	}
	private executionSchedule(): void {
		this.dependencies.account.executionState.takeWake()?.();
		if (this.executionStopped || !this.executionOnline) return;
		const at = this.dependencies.account.scheduling.wakeAt(
			this.executionLanes(),
			this.dependencies.account.executionState.writeRetries()
		);
		if (at === null) return;
		const wakeVersion = this.dependencies.account.executionState.wakeVersion;
		this.dependencies.account.executionState.setWake(
			this.dependencies.account.scheduler.schedule(at, async () => {
				if (
					this.dependencies.account.executionState.stopped ||
					this.dependencies.account.executionState.wakeVersion !== wakeVersion
				)
					return;
				this.dependencies.account.executionState.setWake(null);
				const due = this.dependencies.account.scheduling.dueLanes(
					this.executionLanes(),
					this.dependencies.account.executionState.writeRetries(),
					this.dependencies.account.scheduler.now()
				);
				await Promise.all(due.map((lane) => this.executionRequest(lane)));
			})
		);
	}
	private get queueOnline() {
		return this.executionOnline;
	}
	private get queueStopped() {
		return this.executionStopped;
	}
	private async queueReload(): Promise<void> {
		const generation = this.dependencies.account.queueState.advanceGeneration();
		const state = await this.outboxSnapshot(this.dependencies.account.accountId);
		if (generation === this.dependencies.account.queueState.reloadGeneration)
			this.queueApplyStored(state);
	}
	private queueApplyStored(
		state: OutboxProjection<WorkspaceCommand, WorkspaceRecord>,
		notify = true
	): void {
		if (this.queueStopped) return;

		const retryable = new Set(
			state.entries
				.filter(
					(entry) =>
						entry.delivery.kind === 'retry' ||
						entry.delivery.kind === 'queued' ||
						entry.delivery.kind === 'sending'
				)
				.map((entry) => entry.intent.operationId)
		);
		this.executionRetainWriteRetries(retryable);
		this.dependencies.account.queueState.replace(state);
		if (notify) this.queueNotify();
	}
	private async queueAppend(draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>): Promise<string> {
		if (this.queueStopped) throw new Error('This account is no longer active');
		const id = await this.outboxAppend(this.dependencies.account.accountId, draft);
		await this.queueReload();
		return id;
	}
	private async queueKeepLocal(operationId: string): Promise<string> {
		if (this.queueStopped) throw new Error('This account is no longer active');
		const replacementId = crypto.randomUUID();
		await this.outboxKeepLocal(this.dependencies.account.accountId, operationId, replacementId);
		await this.queueReload();
		return replacementId;
	}
	private async queueDiscard(operationIds: readonly string[]): Promise<void> {
		if (this.queueStopped) throw new Error('This account is no longer active');
		await this.dependencies.account.writerLock.run(
			this.dependencies.account.accountId,
			async () => {
				await this.outboxRecover(this.dependencies.account.accountId);
				const all = await this.outboxList(this.dependencies.account.accountId);
				const selected = all.filter((entry) => operationIds.includes(entry.intent.operationId));
				if (
					selected.some((entry) =>
						this.dependencies.account.editing
							.dependents(all, entry.intent.operationId)
							.some((child) => !operationIds.includes(child.intent.operationId))
					)
				)
					throw new Error('Review dependent edits before discarding their base');
				if (selected.length !== operationIds.length)
					throw new Error('The selected local edits changed; review them again');
				for (const entry of selected) {
					if (entry.delivery.kind !== 'retry') continue;
					const recovery = this.dependencies.account.writeTransport.recovery;
					if (!this.queueOnline || !recovery)
						throw new Error('Reconnect to confirm the last send before discarding');
					const outcome = await recovery.cancel({
						operationId: entry.intent.operationId,
						baseEtag: entry.intent.base?.etag ?? null,
						command: entry.intent.command
					});
					await this.outboxSettle(
						this.dependencies.account.accountId,
						entry,
						outcome.kind === 'cancelled'
							? { kind: 'rejected', message: 'Cancelled before application' }
							: outcome
					);
					if ((outcome.kind === 'applied' || outcome.kind === 'proven') && !this.queueStopped)
						this.executionCommitted();
				}
				const remaining = await this.outboxList(this.dependencies.account.accountId);
				await this.outboxDiscard(
					this.dependencies.account.accountId,
					operationIds.filter((id) => remaining.some((entry) => entry.intent.operationId === id))
				);
			}
		);
		await this.queueReload();
	}
	private async queueSubmit(): Promise<SubmissionResult> {
		if (this.queueStopped) return { kind: 'stopped' };
		await this.queueReload();
		if (this.queueStopped) return { kind: 'stopped' };
		if (!this.queueOnline) return { kind: 'offline' };
		const ownership = await this.dependencies.account.writerLock.tryRun(
			this.dependencies.account.accountId,
			async (): Promise<SubmissionResult> => {
				if (this.queueStopped) return { kind: 'stopped' };
				if (!this.queueOnline) return { kind: 'offline' };
				await this.outboxRecover(this.dependencies.account.accountId);
				const excluded = new Set(this.executionExcludedWrites());
				let failure: SubmissionResult = { kind: 'complete' };
				while (!this.queueStopped && this.queueOnline) {
					const sent = await this.outboxTake(this.dependencies.account.accountId, excluded);
					await this.queueReload();
					if (!sent) {
						if (
							this.dependencies.account.delivery.next(
								this.dependencies.account.queueState.read().entries,
								excluded
							)
						)
							continue;
						const deferred = this.dependencies.account.queueState
							.read()
							.entries.find((entry) => entry.delivery.kind === 'retry');
						return deferred?.delivery.kind === 'retry'
							? { kind: 'failure', message: deferred.delivery.message }
							: failure;
					}
					if (this.queueStopped) return { kind: 'stopped' };
					if (!this.queueOnline) return { kind: 'offline' };
					// Once taken, the input remains immutable even if the request's outcome is lost.
					const response = await this.queueSend(sent);
					if (response.kind === 'failure') {
						await this.outboxRetry(
							this.dependencies.account.accountId,
							sent.intent.operationId,
							response.message
						);
						await this.queueReload();
						this.executionDeferWrite(sent.intent.operationId);
						excluded.add(sent.intent.operationId);
						failure = { kind: 'failure', message: response.message };
						if (response.accountChanged) {
							this.executionSetOnline(false);
							return failure;
						}
						continue;
					}
					const outcome = response.outcome;
					await this.outboxSettle(this.dependencies.account.accountId, sent, outcome);
					this.executionClearWriteRetry(sent.intent.operationId);
					if ((outcome.kind === 'applied' || outcome.kind === 'proven') && !this.queueStopped)
						this.executionCommitted();
					await this.queueReload();
				}
				return this.queueStopped ? { kind: 'stopped' } : { kind: 'offline' };
			}
		);
		return ownership.kind === 'busy' ? { kind: 'waiting' } : ownership.value;
	}
	private async queueSend(
		sent: OutboxEntry<WorkspaceCommand, WorkspaceRecord>
	): Promise<
		| { kind: 'response'; outcome: WriteOutcome<WorkspaceRecord> }
		| { kind: 'failure'; message: string; accountChanged: boolean }
	> {
		try {
			const outcome = await this.dependencies.account.writeTransport.send({
				operationId: sent.intent.operationId,
				baseEtag: sent.intent.base?.etag ?? null,
				command: sent.intent.command
			});
			return { kind: 'response', outcome };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Submission failed',
				accountChanged: error instanceof OutboxAccountChangedError
			};
		}
	}
	private queueNotify(): void {
		for (const listener of this.dependencies.account.queueState.listeners()) listener();
	}
	private get resourceRevision() {
		return this.dependencies.account.resourceState.revision;
	}
	private get resourceLocal() {
		return this.dependencies.account.resourceState.local;
	}
	private get resourceStopped() {
		return this.dependencies.account.resourceState.stopped;
	}
	private get resourceFailure() {
		return this.dependencies.account.resourceState.failure;
	}
	private get resourceCached() {
		return this.dependencies.account.resourceState.records;
	}
	private get resourceActive(): boolean {
		return !this.resourceStopped;
	}
	private get resourceOnline(): boolean {
		void this.resourceRevision;
		return this.executionOnline;
	}
	private resourceApplyLocal(
		projection: WorkspaceLocalProjection<WorkspaceCommand, WorkspaceRecord>
	): void {
		if (this.resourceStopped) return;
		const previous = this.resourceLocal?.writes.entries ?? [];
		this.dependencies.account.resourceState.update({ local: projection });
		this.dependencies.account.projectionState.replace(
			visibleResources(this.resourceCached, projection.writes.entries)
		);
		this.cacheApplyStored(projection.cache, false);
		this.queueApplyStored(projection.writes, false);
		this.dependencies.account.resourceState.invalidate();
		// Only a newly queued identity wakes submissions. Cache changes and delivery updates do not loop.
		if (
			projection.writes.entries.some(
				(entry) =>
					entry.delivery.kind === 'queued' &&
					!previous.some((old) => old.intent.operationId === entry.intent.operationId)
			)
		)
			this.executionChanged();
	}
	private get resourcePending() {
		void this.resourceRevision;
		return this.resourceLocal?.writes.entries ?? [];
	}
	private get resourceReadStatus() {
		void this.resourceRevision;
		return (
			this.resourceFailure ??
			(this.executionFailure
				? { kind: 'failure' as const, message: this.executionFailure }
				: this.cacheStatus)
		);
	}
	private async resourceReadLocal(): Promise<void> {
		this.resourceApplyLocal(
			await this.dependencies.account.repository.read(this.dependencies.account.accountId)
		);
	}
	private resourceAccess(identity: WorkspaceResourceIdentity): CacheAccess<WorkspaceRecord> {
		void this.resourceRevision;
		if (this.resourceFailure) return this.resourceFailure;
		if (this.resourceStopped) return { kind: 'unavailable' };
		const key = workspaceResourceKey(identity);
		return (
			localResource(this.resourcePending, key) ??
			accessCache(this.resourceCached.get(key), this.resourceOnline, this.cacheTransfer(key))
		);
	}
	private async resourceOpen(
		identity: WorkspaceResourceIdentity
	): Promise<CacheAccess<WorkspaceRecord>> {
		await this.resourceInitialize();
		const known = this.resourceAccess(identity);
		if (known.kind === 'ready' || known.kind === 'deleted') return known;
		const result = await this.cacheOpen(workspaceResourceKey(identity));
		if (result.kind !== 'ready' && result.kind !== 'deleted') return result;
		await this.resourceReadLocal();
		return this.resourceAccess(identity);
	}
	private resourceEditBase(identity: WorkspaceResourceIdentity): WorkspaceEditContext {
		return this.dependencies.draftRules.editBase(
			this.resourcePending,
			workspaceResourceKey(identity),
			this.resourceSnapshot(identity)
		);
	}
	private resourceState(identity: WorkspaceResourceIdentity) {
		void this.resourceRevision;
		return this.resourceCached.get(workspaceResourceKey(identity));
	}
	private resourceSnapshot(
		identity: WorkspaceResourceIdentity
	): SyncSnapshot<WorkspaceRecord> | null {
		void this.resourceRevision;
		const entry = this.resourceCached.get(workspaceResourceKey(identity));
		return entry?.kind === 'present' ? cachedSnapshot(entry) : null;
	}
	private async resourceKeepLocal(operationId: string): Promise<string> {
		const replacement = await this.queueKeepLocal(operationId);
		await this.resourceReadLocal();
		return replacement;
	}
	private resourceAcknowledgedVersion(key: string, operationId: string): SyncEtag | null {
		void this.resourceRevision;
		const receipt = this.resourceLocal?.writes.receipts.get(key);
		if (receipt?.operationId !== operationId) return null;
		return receipt.resource.kind === 'found'
			? receipt.resource.snapshot.etag
			: receipt.resource.etag;
	}
	private resourceUncertainWrite(key: string, operationId: string | null): boolean {
		return this.dependencies.draftRules.uncertain(
			this.resourcePending,
			this.resourceLocal?.writes.receipts.get(key) ?? null,
			operationId
		);
	}
	private async resourceDiscard(operationIds: readonly string[]): Promise<void> {
		await this.queueDiscard(operationIds);
		await this.resourceReadLocal();
	}
	private async resourceStage(
		draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>
	): Promise<StagedWrite> {
		assertWorkspaceWriteIdentity(draft);
		// IndexedDB cannot clone a Svelte proxy; snapshot once at the shared UI boundary.
		await this.resourceInitialize();
		const operationId = await this.queueAppend(this.dependencies.environment.snapshot(draft));
		await this.resourceReadLocal();
		const staged = this.resourceStaged(draft, operationId);
		void this.resourceSynchronize();
		return staged;
	}
	private resourceStaged(
		draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>,
		operationId: string
	): StagedWrite {
		const entry = this.resourcePending.find(
			(pending) => pending.intent.operationId === operationId
		);
		if (entry) return { base: entry.intent.base, basedOn: operationId, local: entry.intent.local };
		const receipt = this.resourceLocal?.writes.receipts.get(draft.key);
		if (receipt?.operationId === operationId)
			return receipt.resource.kind === 'found'
				? {
						base: receipt.resource.snapshot,
						basedOn: operationId,
						local: receipt.resource.snapshot.value
					}
				: { base: null, basedOn: operationId, local: null };
		// Settled without a stored receipt: `uncertainWrite` reports it, and the caller keeps its copy.
		return { base: draft.base, basedOn: operationId, local: draft.local };
	}
	private resourceSynchronize(force = false): Promise<void> {
		return this.executionSynchronize(force);
	}
	private get draftCurrent() {
		return this.dependencies.draftState.read().current;
	}
	private set draftCurrent(value: WorkspaceEditContext | null) {
		this.dependencies.draftState.update({ current: value });
	}
	private get draftSavingLocal() {
		return this.dependencies.draftState.read().savingLocal;
	}
	private set draftSavingLocal(value: number) {
		this.dependencies.draftState.update({ savingLocal: value });
	}
	private get draftError() {
		return this.dependencies.draftState.read().error;
	}
	private set draftError(value: string | null) {
		this.dependencies.draftState.update({ error: value });
	}
	private get draftStaging() {
		return this.dependencies.draftState.staging;
	}
	private set draftStaging(value: Promise<void>) {
		this.dependencies.draftState.setStaging(value);
	}
	private get draftActive(): boolean {
		return this.resourceActive;
	}
	private get draftEntries() {
		return this.resourcePending.filter((entry) => entry.intent.key === this.key);
	}
	private draftValueOf(record: WorkspaceRecord): Note {
		if (record.type !== 'notes') throw new Error('The surface received another resource type');
		return record.value;
	}
	private get draftNewer(): Note | null {
		const current = this.draftCurrent,
			snapshot = this.resourceSnapshot(this.identity);
		if (!current || !snapshot || this.draftEntries.length) return null;
		const observed = this.dependencies.draftRules.observedVersion(
			current,
			this.resourceLocal?.writes.receipts.get(this.key) ?? null
		);
		return observed !== null && compareSyncEtags(snapshot.etag, observed) > 0
			? this.draftValueOf(snapshot.value)
			: null;
	}
	private draftAdopt(): Note {
		this.draftCurrent = this.resourceEditBase(this.identity);
		return this.draftValueOf(this.draftCurrent.local);
	}
	private get draftValue(): Note | null {
		if (!this.resourceActive) return null;
		const record = this.dependencies.draftRules.value(
			this.draftCurrent,
			this.draftEntries,
			this.resourceState(this.identity)?.kind === 'deleted'
		);
		return record ? this.draftValueOf(record) : null;
	}
	private get draftStatus(): DraftStatus {
		return this.dependencies.draftRules.status(
			this.draftError,
			this.resourceUncertainWrite(this.key, this.draftCurrent?.basedOn ?? null),
			this.draftCurrent !== null,
			this.draftSavingLocal,
			this.draftEntries
		);
	}
	private get draftLastError(): string | undefined {
		return this.dependencies.draftRules.lastError(
			this.draftError,
			this.resourceUncertainWrite(this.key, this.draftCurrent?.basedOn ?? null),
			this.draftEntries
		);
	}
	private get draftConflict(): WriteConflictView<Note> | undefined {
		const entry = this.draftEntries.find((entry) => entry.delivery.kind === 'conflict');
		if (!entry || entry.delivery.kind !== 'conflict') return undefined;
		const remote = entry.delivery.remote;
		return {
			base: entry.intent.base ? this.draftValueOf(entry.intent.base.value) : null,
			local: this.draftValue,
			remote:
				remote.kind === 'found'
					? { kind: 'found', value: this.draftValueOf(remote.snapshot.value) }
					: remote
		};
	}
	private draftRead(): Promise<CacheAccess<Note>>;
	private draftRead(isCurrent: () => boolean): Promise<CacheAccess<Note> | { kind: 'superseded' }>;
	private async draftRead(
		isCurrent: () => boolean = () => true
	): Promise<CacheAccess<Note> | { kind: 'superseded' }> {
		this.draftError = null;
		try {
			const opened = await this.resourceOpen(this.identity);
			if (!isCurrent() || !this.resourceActive) return { kind: 'superseded' };
			if (opened.kind !== 'ready') {
				this.draftError = accessMessage(opened, 'item');
				return opened;
			}
			return { kind: 'ready', value: this.draftAdopt() };
		} catch (error) {
			if (!isCurrent() || !this.resourceActive) return { kind: 'superseded' };
			this.draftError = error instanceof Error ? error.message : 'Device storage is unavailable';
			return { kind: 'failure', message: this.draftError };
		}
	}
	private draftStage(command: NoteCommand): WorkspaceSaveResult {
		return this.draftEnqueue(command);
	}
	private draftDiscardPublished(revision: NoteRevision): WorkspaceSaveResult {
		return this.draftEnqueue({ kind: 'discardPublished', revision });
	}
	private draftEnqueue(command: DraftCommand): WorkspaceSaveResult {
		const input = this.dependencies.environment.snapshot(command);
		const now = this.dependencies.environment.now();
		this.draftSavingLocal++;
		const operation = this.draftStaging
			.then(() => this.draftSave(input, now))
			.finally(() => {
				this.draftSavingLocal--;
			});
		this.draftStaging = operation.then(() => undefined);
		return operation;
	}
	private async draftSave(
		command: DraftCommand,
		now: DateTime
	): Promise<{ kind: 'saved'; value: Note | null } | { kind: 'failure'; message: string }> {
		this.draftError = null;
		try {
			if (!this.draftActive)
				return { kind: 'failure', message: 'This workspace account has stopped' };
			const context = this.draftCurrent;
			if (!context) throw new Error('Open the resource before editing');
			const content =
				command.kind === 'discardPublished'
					? this.draftPublishedContent(command.revision, context.local)
					: await this.resourcePrepareCommand(command, context.local, now);
			if (workspaceResourceKey(mutationResource(content.command)) !== this.key)
				throw new Error('The edit belongs to a different resource');
			if (content.local) this.draftValueOf(content.local);
			const staged = await this.resourceStage({
				...content,
				operationId: this.dependencies.environment.operationId(),
				key: this.key,
				base: context.base,
				basedOn: context.basedOn
			});
			if (!this.draftActive)
				return { kind: 'failure', message: 'This workspace account has stopped' };
			this.draftCurrent = { ...staged, local: staged.local ?? context.local };
			return { kind: 'saved', value: this.draftValue };
		} catch (error) {
			if (!this.draftActive)
				return { kind: 'failure', message: 'This workspace account has stopped' };
			this.draftError =
				error instanceof Error ? error.message : 'The local edit could not be saved';
			return { kind: 'failure', message: this.draftError };
		}
	}
	private draftPublishedContent(revision: NoteRevision, record: WorkspaceRecord) {
		if (
			record.type !== 'notes' ||
			record.value.id !== revision.noteId ||
			record.value.publishedRevision !== revision.revision
		)
			throw new Error('Load the observed published version before discarding changes');
		return {
			command: { kind: 'discardNoteDraft' as const, noteId: revision.noteId },
			local: {
				type: 'notes' as const,
				value: {
					...record.value,
					document: revision.document,
					plainText: revision.plainText,
					title: revision.title,
					currentRevision: record.value.currentRevision + 1
				}
			},
			coalesce: null,
			references: []
		};
	}
	private async draftRetry(): Promise<void> {
		this.draftError = null;
		if (!this.draftCurrent) await this.draftRead();
		await this.resourceSynchronize(true);
	}
	private async draftKeep(): Promise<void> {
		const conflict = this.draftEntries.find((entry) => entry.delivery.kind === 'conflict');
		if (!conflict) throw new Error('This resource has no unresolved conflict');
		const replacementId = await this.resourceKeepLocal(conflict.intent.operationId);
		if (
			this.draftCurrent?.basedOn === conflict.intent.operationId &&
			conflict.delivery.kind === 'conflict' &&
			conflict.delivery.remote.kind === 'found'
		) {
			this.draftCurrent = {
				...this.draftCurrent,
				basedOn: replacementId,
				base: conflict.delivery.remote.snapshot
			};
		}
		await this.resourceSynchronize();
	}
	private draftDiscard(): Promise<CacheAccess<Note>>;
	private draftDiscard(
		isCurrent: () => boolean
	): Promise<CacheAccess<Note> | { kind: 'superseded' }>;
	private async draftDiscard(
		isCurrent: () => boolean = () => true
	): Promise<CacheAccess<Note> | { kind: 'superseded' }> {
		const reviewed = this.draftEntries;
		const conflict = reviewed.find((entry) => entry.delivery.kind === 'conflict');
		const state = this.resourceState(this.identity);
		const snapshot = this.resourceSnapshot(this.identity);
		if (state?.kind !== 'deleted') {
			if (!snapshot) throw new Error('Download the server copy before discarding the local edit');
			if (conflict?.delivery.kind === 'conflict' && conflict.delivery.remote.kind === 'found') {
				const observed = conflict.delivery.remote.snapshot;
				if (
					observed.etag !== null
						? compareSyncEtags(snapshot.etag, observed.etag) < 0
						: !this.resourceOnline || this.resourceReadStatus.kind !== 'complete'
				)
					throw new Error('Reconnect to validate the server copy before discarding the local edit');
			}
		}
		await this.resourceDiscard(reviewed.map((entry) => entry.intent.operationId));
		if (!isCurrent()) return { kind: 'superseded' };
		if (state?.kind === 'deleted') {
			this.draftCurrent = null;
			return { kind: 'deleted' };
		}
		return this.draftRead(isCurrent);
	}
	private get sessionFailure(): string | null {
		return this.dependencies.sessionState.read().failure;
	}
	private get sessionDirty(): boolean {
		return (
			this.dependencies.sessionState.read().edited !==
			this.dependencies.sessionState.read().persisted
		);
	}
	private sessionChanged(): void {
		this.dependencies.sessionState.update({
			edited: this.dependencies.sessionState.read().edited + 1,
			failure: null
		});
	}
	private sessionCheckpoint(): () => boolean {
		const { edited, epoch } = this.dependencies.sessionState.read();
		return () =>
			!this.dependencies.sessionState.read().closed &&
			this.active &&
			edited === this.dependencies.sessionState.read().edited &&
			epoch === this.dependencies.sessionState.read().epoch;
	}
	private sessionAccept(apply: () => void = () => undefined): void {
		const current = this.dependencies.sessionState.read();
		if (current.closed || !this.active) return;
		this.dependencies.sessionState.update({
			epoch: current.epoch + 1,
			edited: current.edited + 1,
			persisted: current.edited + 1,
			failure: null
		});
		apply();
	}
	private sessionClose(): void {
		this.dependencies.sessionState.update({
			closed: true,
			epoch: this.dependencies.sessionState.read().epoch + 1
		});
	}
	private sessionSave<T>(
		persist: () => Promise<EditorSave<T>>,
		apply: (value: T, unchanged: boolean) => void
	): Promise<void> {
		const flight = this.dependencies.sessionState.flight;
		if (flight)
			return flight.then(() => {
				if (
					this.sessionDirty &&
					!this.sessionFailure &&
					!this.dependencies.sessionState.read().closed &&
					this.active
				)
					return this.sessionSave(persist, apply);
			});
		const pending = this.sessionFlush(persist, apply).finally(() => {
			this.dependencies.sessionState.setFlight(null);
			this.dependencies.sessionState.update({ saving: false });
		});
		this.dependencies.sessionState.setFlight(pending);
		return pending;
	}
	private async sessionFlush<T>(
		persist: () => Promise<EditorSave<T>>,
		apply: (value: T, unchanged: boolean) => void
	): Promise<void> {
		this.dependencies.sessionState.update({ saving: true });
		const epoch = this.dependencies.sessionState.read().epoch;
		while (
			this.sessionDirty &&
			!this.dependencies.sessionState.read().closed &&
			this.active &&
			epoch === this.dependencies.sessionState.read().epoch
		) {
			const generation = this.dependencies.sessionState.read().edited;
			const result = await persist().catch((error): EditorSave<T> => {
				return {
					kind: 'failure',
					message: error instanceof Error ? error.message : 'The edit could not be saved'
				};
			});
			if (
				this.dependencies.sessionState.read().closed ||
				!this.active ||
				epoch !== this.dependencies.sessionState.read().epoch
			)
				return;
			if (result.kind === 'failure') {
				this.dependencies.sessionState.update({ failure: result.message });
				return;
			}
			this.dependencies.sessionState.update({ persisted: generation, failure: null });
			apply(result.value, generation === this.dependencies.sessionState.read().edited);
		}
	}
	private get identity(): WorkspaceResourceIdentity & { type: 'notes' } {
		return { type: 'notes', id: [this.dependencies.noteId] };
	}
	private get key(): string {
		return workspaceResourceKey(this.identity);
	}
	private resourceInitialize(): Promise<void> {
		const account = this.dependencies.account;
		if (account.resourceState.stopped)
			return Promise.reject(new Error('This workspace account has stopped'));
		const initializing = account.resourceState.initializing;
		if (!initializing) throw new Error('Open the workspace before mounting a note');
		return initializing;
	}
	private accountFailureChanged(): void {
		this.queueNotify();
	}
	private rebaseRecord(observed: WorkspaceRecord, local: WorkspaceRecord, onto: WorkspaceRecord) {
		if (observed.type !== onto.type || local.type !== onto.type) return null;

		if (observed.type === 'widgets' && local.type === 'widgets' && onto.type === 'widgets') {
			const { widgetPatches, widgetReader, widgetEditing } = this.dependencies.account;
			const fields = this.dependencies.account.fields.replay(
				'widgets',
				observed.value,
				local.value,
				onto.value
			);
			const { overlaps, ...parts } = widgetPatches.rebaseParts(
				observed.value,
				local.value,
				onto.value
			);
			const candidate = { ...fields.value, ...parts };
			const read = widgetReader.read(candidate, widgetCatalog);
			const validation =
				read.kind === 'invalid' ? read : widgetEditing.decide(read.widget, read.issues);
			return {
				value: { type: 'widgets' as const, value: candidate },
				overlaps: fields.overlaps || overlaps || validation.kind !== 'applied'
			};
		}
		const rebased = this.dependencies.account.fields.replay(
			onto.type,
			observed.value,
			local.value,
			onto.value
		);
		const record = structuredClone(onto);
		Object.assign(record.value, rebased.value);
		return { value: record, overlaps: rebased.overlaps };
	}
	private async resourcePrepareCommand(
		command: PreparedWorkspaceCommand,
		observed: WorkspaceRecord | null,
		now: DateTime
	): Promise<WriteContent<WorkspaceCommand, WorkspaceRecord>> {
		if (!observed || observed.type !== 'notes') throw new Error('Open the note before editing');
		const note = observed.value;
		switch (command.kind) {
			case 'saveNote':
				return {
					command,
					local: { type: 'notes', value: this.dependencies.noteEditing.edit(note, command, now) },
					coalesce: 'document',
					references: []
				};
			case 'publishNote':
				return {
					command,
					local: {
						type: 'notes',
						value: { ...note, publishedRevision: note.currentRevision, publishedAt: now }
					},
					coalesce: null,
					references: []
				};
			case 'noteNumbering':
				return {
					command,
					local: {
						type: 'notes',
						value: { ...note, sectionNumbering: command.enabled, updatedAt: now }
					},
					coalesce: null,
					references: []
				};
			default:
				throw new Error('This operation does not belong to the note workspace');
		}
	}
	private async editingSave(note: Note): Promise<EditorSave<Note>> {
		return this.requireSavedNote(
			await this.draftStage({
				kind: 'saveNote',
				noteId: note.id,
				document: note.document,
				plainText: note.plainText,
				title: note.title,
				isPinned: note.isPinned
			})
		);
	}
	private editingTogglePin(note: Note): Promise<EditorSave<Note>> {
		return this.editingSave({ ...note, isPinned: !note.isPinned });
	}
	private async editingNumbering(level: SectionNumberingLevel): Promise<EditorSave<Note>> {
		return this.requireSavedNote(
			await this.draftStage({
				kind: 'noteNumbering',
				noteId: this.dependencies.noteId,
				enabled: this.dependencies.sections.fromMenu(level)
			})
		);
	}
	private requireSavedNote(result: WorkspaceSave<'notes'>): EditorSave<Note> {
		if (result.kind === 'failure') return result;
		return result.value
			? { kind: 'saved', value: result.value }
			: { kind: 'failure', message: 'The note no longer exists' };
	}
	private replaceEditorDocument(
		document: ProseMirrorDocument,
		previous?: ProseMirrorDocument
	): void {
		const editor = this.mountedEditor();
		if (!editor || !editor.state.active || !editor.port.active) return;
		editor.state.setInitialized(false);
		try {
			editor.port.setDocument(
				this.dependencies.documents.copy(this.dependencies.presentation.prepare(document))
			);
		} finally {
			editor.state.setInitialized(true);
		}
		if (previous)
			editor.events.shimmer(this.dependencies.presentation.changedBlocks(previous, document));
	}
	private bindingCurrent(): boolean {
		const { binding, account } = this.dependencies;
		return (
			binding.state.generation === binding.generation &&
			binding.state.accountId === account.accountId &&
			binding.environment.accountId === account.accountId &&
			!account.resourceState.stopped
		);
	}
	private stopAccountBinding(): void {
		const { binding, account } = this.dependencies;
		const ownsBinding = binding.state.generation === binding.generation;
		const detach = ownsBinding ? binding.state.detach : null;
		if (ownsBinding) binding.state.clear();
		account.resourceState.update({ stopped: true, local: null });
		account.resourceState.setInitializing(null);
		account.projectionState.replace(new Map());
		account.executionState.stop();
		account.executionState.takeWake()?.();
		account.cacheState.update({ stopped: true, entries: new Map(), result: { kind: 'stopped' } });
		account.cacheState.clearAttempts();
		this.cacheNotify();
		account.queueState.clear();
		this.queueNotify();
		for (const unsubscribe of account.resourceState.takeSubscriptions()) unsubscribe();
		binding.dispose();
		detach?.();
		if (ownsBinding) binding.environment.reload();
	}
	private async synchronizeAccount(): Promise<void | { kind: 'failure' }> {
		const { binding, account } = this.dependencies;
		if (!this.bindingCurrent()) {
			this.stopAccountBinding();
			return;
		}
		account.cacheState.update({ online: binding.environment.online });
		this.cacheNotify();
		account.executionState.setOnline(binding.environment.online);
		try {
			if (binding.state.startupError && binding.environment.online)
				await this.refreshAccountBootstrap();
			if (!this.bindingCurrent()) return;
			await Promise.all([
				this.resourceOpen({ type: 'users', id: [account.accountId] }),
				this.resourceSynchronize()
			]);
			if (!this.bindingCurrent()) this.stopAccountBinding();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Workspace synchronization failed';
			binding.state.failAt(binding.generation, message);
			return { kind: 'failure' };
		}
	}
	private async refreshAccountBootstrap(): Promise<void | { kind: 'failure' }> {
		const { binding, account } = this.dependencies;
		try {
			const bootstrap = await binding.environment.fetchBootstrap();
			if (binding.state.generation !== binding.generation) return;
			if (bootstrap.accountId !== account.accountId || !this.bindingCurrent()) {
				this.stopAccountBinding();
				return;
			}
			binding.environment.saveBootstrap(bootstrap);
			binding.state.refreshAt(binding.generation, bootstrap);
		} catch (error) {
			binding.state.failAt(
				binding.generation,
				error instanceof Error ? error.message : 'Deployment settings could not be refreshed'
			);
			return { kind: 'failure' };
		}
	}
	private ancestryDraft(
		entries: readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[],
		draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>,
		receipt: WriteReceipt<WorkspaceRecord> | null
	): WriteDraft<WorkspaceCommand, WorkspaceRecord> {
		const newer =
			receipt?.resource.kind === 'found' &&
			draft.base !== null &&
			compareSyncEtags(receipt.resource.snapshot.etag, draft.base.etag) > 0;
		const decision = this.dependencies.account.ancestry.draft(entries, draft, receipt, newer);
		if (decision.kind === 'unchanged') return draft;
		if (decision.kind === 'adopt') return decision.draft;
		if (draft.local === null) throw new Error('A deletion cannot request a record replay');
		const rebased = this.rebaseRecord(decision.observed, draft.local, decision.onto);
		return rebased
			? { ...draft, base: decision.base, basedOn: decision.basedOn, local: rebased.value }
			: draft;
	}
	private ancestryConflicted(
		entries: readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[],
		operationId: string
	): readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[] {
		const conflict = this.dependencies.account.ancestry.conflict(entries, operationId);
		if (!conflict) return entries;
		const rebased = this.rebaseRecord(conflict.observed, conflict.local, conflict.remote.value);
		if (!rebased || rebased.overlaps) return entries;
		const replayed = new Map<string, WorkspaceRecord>();
		let previous = { from: conflict.local, to: rebased.value };
		for (const entry of conflict.descendants) {
			const local = entry.intent.local;
			if (local === null) throw new Error('A deletion cannot be an ancestry replay descendant');
			const next = this.rebaseRecord(previous.from, local, previous.to);
			if (!next) continue;
			previous = { from: local, to: next.value };
			replayed.set(entry.intent.operationId, next.value);
		}
		return this.dependencies.account.ancestry.acceptConflict(
			entries,
			conflict,
			rebased.value,
			replayed
		);
	}
	private mountedEditor(): NoteWorkspaceEditor | undefined {
		const identity = this.dependencies.editorIdentity();
		if (!identity) return undefined;
		return this.dependencies.editors.get(identity);
	}
}
