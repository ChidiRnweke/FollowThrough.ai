import {
	DexieWorkspaceRepository,
	type WorkspaceLocalProjection
} from '$lib/client/sync/workspace-local-repository';
import { WorkspaceSyncRuntime } from '$lib/client/sync/workspace-runtime';
import { type SyncScheduler, browserSyncScheduler } from '$lib/client/sync/scheduler';
import { type NoteId, type NoteView } from '$lib/models/notes';
import {
	visibleResources,
	localResource,
	type WriteDraft,
	type WriteContent,
	type DraftStatus,
	type WriteConflictView,
	type WriteBase
} from '$lib/models/outbox';
import {
	workspaceRecordSchema,
	workspaceRecordIdentity,
	isWorkspaceRecord,
	type WorkspaceValues,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import {
	workspaceCommandSchema,
	mutationResource,
	assertWorkspaceWriteIdentity,
	resolveImportedNoteBase,
	type WorkspaceCommand
} from '$lib/models/workspace-mutations';
import {
	workspaceResourceKey,
	type WorkspaceResourceType,
	type WorkspaceResourceIdentity
} from '$lib/models/workspace-sync';
import { WorkspaceViews } from '$lib/models/workspace-views';
import {
	cachedSnapshot,
	collectionReadiness,
	compareSyncEtags,
	type CacheAccess,
	type SyncSnapshot
} from '$lib/models/sync';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { migrateLegacyNotes } from '$lib/client/sync/legacy-notes';
import { IndexedDbStorageRecovery } from '$lib/client/sync/storage-recovery';
import type { StorageRecoveryItem } from '$lib/models/sync';
import {
	browserWriterLock,
	withWorkspaceMigrationLock
} from '$lib/client/sync/browser-writer-lock';
import {
	workspaceReadTransport,
	workspaceWriteTransport
} from '$lib/client/sync/workspace-transport';

const plain = <T>(value: T): T => $state.snapshot(value) as T;

export interface WorkspaceResourcesDependencies {
	scheduler?: SyncScheduler;
	dispose?(): void;
	restoreLocalWrites(): Promise<void>;
	cache: ResourceCache<WorkspaceRecord>;
	writes: MutationQueue<WorkspaceCommand, WorkspaceRecord>;
}

/** Features share resource identity, local overlays, and the same explicit-open read barrier. */
export class WorkspaceResources {
	private revision = $state(0);
	private readonly runtime: WorkspaceSyncRuntime;
	private readonly recoveryStorage = new IndexedDbStorageRecovery();
	private readonly projected = $derived.by(() => {
		void this.revision;
		return visibleResources(this.dependencies.cache.records, this.dependencies.writes.pending);
	});
	private readonly projections = $derived(new WorkspaceViews(this.projected));
	private recovery = $state<readonly StorageRecoveryItem[]>([]);
	get recoveryItems(): readonly StorageRecoveryItem[] {
		return this.recovery;
	}
	async loadRecovery(): Promise<void> {
		const items = await this.recoveryStorage.list(this.accountId);
		if (!this.stopped) this.recovery = items;
	}

	async removeRecovery(item: StorageRecoveryItem): Promise<void> {
		if (!this.active) throw new Error('This account is no longer active');
		await this.recoveryStorage.remove(this.accountId, item.source, item.key);
		await this.loadRecovery();
		await this.synchronize();
	}

	downloadRecovery(item: StorageRecoveryItem): Promise<Blob> {
		return this.recoveryStorage.download(this.accountId, item.source, item.key);
	}
	get downloadProgress() {
		void this.revision;
		return this.dependencies.cache.downloadProgress;
	}
	get failedDownloads(): number {
		void this.revision;
		return this.dependencies.cache.failedDownloads;
	}
	private connected = $state(true);
	get active(): boolean {
		return !this.stopped;
	}
	get online(): boolean {
		return this.connected;
	}
	private readonly unsubscribe: (() => void)[];
	private stopped = $state(false);
	private failure = $state<{ kind: 'failure'; message: string } | null>(null);
	private initializing: Promise<void> | null = null;
	constructor(
		readonly accountId: string,
		private readonly dependencies: WorkspaceResourcesDependencies
	) {
		this.runtime = new WorkspaceSyncRuntime({
			scheduler: dependencies.scheduler ?? browserSyncScheduler,
			initialize: () => this.initialize(),
			pull: () => dependencies.cache.refresh(),
			bodies: () => dependencies.cache.warm(),
			writes: () => dependencies.writes.flush(),
			failed: (message) => {
				if (!this.stopped) this.failure = message === null ? null : { kind: 'failure', message };
			}
		});
		dependencies.writes.useScheduler(this.runtime.writeScheduler);
		this.unsubscribe = [
			dependencies.cache.subscribe(() => {
				this.revision++;
			}),
			dependencies.writes.subscribe(() => {
				this.revision++;
			})
		];
	}
	applyLocal(projection: WorkspaceLocalProjection<WorkspaceCommand, WorkspaceRecord>): void {
		if (this.stopped) return;
		const previous = this.dependencies.writes.pending;
		this.dependencies.cache.applyStored(projection.cache, false);
		this.dependencies.writes.applyStored(projection.writes, false);
		this.recovery = projection.recovery;
		this.revision++;
		// Only a newly queued identity wakes submissions. Cache changes and delivery updates do not loop.
		if (
			projection.writes.entries.some(
				(entry) =>
					entry.delivery.kind === 'queued' &&
					!previous.some((old) => old.intent.operationId === entry.intent.operationId)
			)
		)
			this.runtime.changed();
	}
	committed(): void {
		this.runtime.committed();
	}
	observationFailed(error: Error): void {
		if (!this.stopped) this.failure = { kind: 'failure', message: error.message };
	}

	draft<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K }
	): WorkspaceDraft<K> {
		return new WorkspaceDraft<K>(this, identity);
	}

	get records(): ReadonlyMap<string, WorkspaceRecord> {
		return this.projected;
	}
	get views(): WorkspaceViews {
		return this.projections;
	}
	get pending() {
		void this.revision;
		return this.dependencies.writes.pending;
	}
	get availability() {
		void this.revision;
		return this.dependencies.cache.availability;
	}
	get readStatus() {
		void this.revision;
		return this.failure ?? this.dependencies.cache.status;
	}
	get writeStatus() {
		void this.revision;
		return this.dependencies.writes.status;
	}
	initialize(): Promise<void> {
		this.initializing ??= this.dependencies
			.restoreLocalWrites()
			.then(() =>
				Promise.all([this.dependencies.cache.initialize(), this.dependencies.writes.reload()])
			)
			.then(() => undefined)
			.catch((error) => {
				this.initializing = null;
				throw error;
			});
		return this.initializing;
	}
	/** List reads wait only for missing bodies; retained bodies remain renderable during updates. */
	async prepare(types: readonly WorkspaceResourceType[]): Promise<void> {
		await this.initialize();
		if (this.dependencies.cache.availability === 'unknown') await this.dependencies.cache.refresh();
		const missing = [...this.dependencies.cache.records].filter(
			([key, entry]) =>
				entry.kind === 'present' &&
				cachedSnapshot(entry.cache) === null &&
				types.some((type) => key.startsWith(`["${type}",`))
		);
		await this.dependencies.cache.prepare(missing.map(([key]) => key));
	}
	collectionReadiness(types: readonly WorkspaceResourceType[]): 'unknown' | 'incomplete' | 'ready' {
		void this.revision;
		return collectionReadiness(
			this.active && this.dependencies.cache.downloadProgress.inventoryComplete,
			[...this.dependencies.cache.records]
				.filter(([key]) => types.some((type) => key.startsWith(`["${type}",`)))
				.map(([, entry]) => entry)
		);
	}

	async requireCollections(types: readonly WorkspaceResourceType[]): Promise<void> {
		await this.prepare(types);
		if (this.collectionReadiness(types) !== 'ready')
			throw new Error(
				'Required workspace data is not available on this device. Reconnect and retry.'
			);
	}
	async open(identity: WorkspaceResourceIdentity): Promise<CacheAccess<WorkspaceRecord>> {
		await this.initialize();
		const key = workspaceResourceKey(identity);
		const local = localResource(this.dependencies.writes.pending, key);
		if (local) return local;
		const result = await this.dependencies.cache.open(key);
		return localResource(this.dependencies.writes.pending, key) ?? result;
	}
	/** Optional records may use defaults only after the journal proves their absence. */
	async lookup(
		identity: WorkspaceResourceIdentity
	): Promise<CacheAccess<WorkspaceRecord> | { kind: 'absent' }> {
		await this.initialize();
		if (this.stopped) return { kind: 'unavailable' };
		const key = workspaceResourceKey(identity);
		if (localResource(this.dependencies.writes.pending, key)) return this.open(identity);
		if (this.dependencies.cache.availability === 'unknown') {
			const result = await this.dependencies.cache.refresh();
			if (result.kind === 'failure') return result;
			if (this.dependencies.cache.availability === 'unknown') return { kind: 'unavailable' };
		}
		if (this.stopped) return { kind: 'unavailable' };
		return localResource(this.dependencies.writes.pending, key) ||
			this.dependencies.cache.records.has(key)
			? this.open(identity)
			: { kind: 'absent' };
	}
	async openNote(noteId: NoteId): Promise<CacheAccess<NoteView>> {
		const opened = await this.open({ type: 'notes', id: [noteId] });
		if (opened.kind !== 'ready') return opened;
		const projected = this.views.note(noteId);
		return projected ? { kind: 'ready', value: projected.view } : { kind: 'unavailable' };
	}

	/** Capture the version the editor actually sees, before its first change. */
	editBase(identity: WorkspaceResourceIdentity): {
		base: WriteBase<WorkspaceRecord> | null;
		basedOn: string | null;
		local: WorkspaceRecord;
	} {
		void this.revision;
		const key = workspaceResourceKey(identity);
		const pending = this.dependencies.writes.pending.findLast((entry) => entry.intent.key === key);
		if (pending) {
			if (!pending.intent.local) throw new Error('A locally deleted resource cannot be edited');
			return {
				base: pending.intent.base,
				basedOn: pending.intent.operationId,
				local: pending.intent.local
			};
		}
		const snapshot = this.snapshot(identity);
		if (!snapshot) throw new Error('Open the resource before editing it');
		return { base: snapshot, basedOn: null, local: snapshot.value };
	}
	state(identity: WorkspaceResourceIdentity) {
		void this.revision;
		return this.dependencies.cache.records.get(workspaceResourceKey(identity));
	}

	snapshot(identity: WorkspaceResourceIdentity): SyncSnapshot<WorkspaceRecord> | null {
		void this.revision;
		const entry = this.dependencies.cache.records.get(workspaceResourceKey(identity));
		return entry?.kind === 'present' ? cachedSnapshot(entry.cache) : null;
	}
	refreshConflict(operationId: string): Promise<void> {
		return this.dependencies.writes.refreshConflict(operationId);
	}
	async keepLocal(operationId: string): Promise<string> {
		return this.dependencies.writes.keepLocal(operationId);
	}
	uncertainWrite(key: string, operationId: string | null): boolean {
		void this.revision;
		return (
			operationId !== null &&
			!this.pending.some((entry) => entry.intent.operationId === operationId) &&
			!this.dependencies.writes.acknowledged(key, operationId)
		);
	}
	async discard(operationIds: readonly string[]): Promise<void> {
		await this.dependencies.writes.discard(operationIds);
	}

	async append(draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>): Promise<string> {
		assertWorkspaceWriteIdentity(draft);
		// IndexedDB cannot clone a Svelte proxy; snapshot once at the shared UI boundary.
		await this.initialize();
		const operationId = await this.dependencies.writes.append(plain(draft));
		void this.synchronize();
		return operationId;
	}
	setOnline(online: boolean): void {
		this.connected = online;
		this.runtime.setOnline(online);
		this.dependencies.cache.setOnline(online);
		this.dependencies.writes.setOnline(online);
	}
	synchronize(force = false): Promise<void> {
		if (force) this.dependencies.writes.retryNow();
		return this.runtime.synchronize(force);
	}

	stop(): void {
		this.stopped = true;
		this.revision++;
		this.runtime.stop();
		this.recoveryStorage.close();
		this.dependencies.cache.stop();
		this.dependencies.writes.stop();
		for (const unsubscribe of this.unsubscribe) unsubscribe();
		this.dependencies.dispose?.();
	}
}

export const createWorkspaceResources = (accountId: string): WorkspaceResources => {
	const repository = new DexieWorkspaceRepository(workspaceCommandSchema, workspaceRecordSchema);
	const cache = new ResourceCache(accountId, {
		repository: {
			load: async (account) => (await repository.read(account)).cache,
			commit: async (account, changes) => {
				const committed = await repository.cache.commit(account, changes);
				await repository.read(account);
				return committed;
			}
		},
		transport: workspaceReadTransport(accountId)
	});
	const writes = new MutationQueue(accountId, {
		repository,
		transport: workspaceWriteTransport(accountId),
		scheduler: browserSyncScheduler,
		writerLock: browserWriterLock,
		resolveBase: async (key, base, local) => {
			const remote = await workspaceReadTransport(accountId).read(key, null);
			if (remote.kind === 'unchanged')
				throw new Error('An imported base requires a complete server representation');
			return resolveImportedNoteBase(base, local, remote);
		},
		committed: () => resources.committed()
	});
	const resources = new WorkspaceResources(accountId, {
		cache,
		writes,

		restoreLocalWrites: () =>
			withWorkspaceMigrationLock(accountId, () => migrateLegacyNotes(accountId, repository)),
		dispose: () => {
			unsubscribe();
			void writes
				.settled()
				.then(() => repository.close())
				.catch((error) => {
					console.error('Workspace storage could not close', error);
					return { kind: 'failure' };
				});
		}
	});
	const unsubscribe = repository.observe(
		accountId,
		(projection) => resources.applyLocal(projection),
		(error) => resources.observationFailed(error)
	);
	return resources;
};

type EditContext = ReturnType<WorkspaceResources['editBase']>;
/** An editor's observed base, not another resource cache. All persistence and delivery use its workspace. */
export class WorkspaceDraft<K extends WorkspaceResourceType> {
	private current = $state<EditContext | null>(null);
	private staging: Promise<void> = Promise.resolve();
	private savingLocal = $state(0);
	private error = $state<string | null>(null);
	private readonly key: string;
	constructor(
		private readonly resources: WorkspaceResources,
		readonly identity: WorkspaceResourceIdentity & { type: K }
	) {
		this.key = workspaceResourceKey(identity);
	}
	private get entries() {
		return this.resources.pending.filter((entry) => entry.intent.key === this.key);
	}
	private valueOf(record: WorkspaceRecord): WorkspaceValues[K] {
		if (!isWorkspaceRecord(record, this.identity.type))
			throw new Error('The editor received another resource type');
		return record.value;
	}
	get value(): WorkspaceValues[K] | null {
		if (!this.resources.active) return null;
		const creation = this.current?.base === null && this.current.basedOn === null;
		if (
			!creation &&
			!this.entries.length &&
			this.resources.state(this.identity)?.kind === 'deleted'
		)
			return null;
		const last = this.entries.at(-1);
		const record = last ? last.intent.local : this.current?.local;
		return record ? this.valueOf(record) : null;
	}
	get status(): DraftStatus {
		if (this.error || this.resources.uncertainWrite(this.key, this.current?.basedOn ?? null))
			return 'error';
		if (!this.current) return 'loading';
		if (this.savingLocal) return 'saving';
		if (this.entries.some((entry) => entry.delivery.kind === 'conflict')) return 'conflict';
		if (
			this.entries.some(
				(entry) => entry.delivery.kind === 'rejected' || entry.delivery.kind === 'retry'
			)
		)
			return 'error';
		if (this.entries.some((entry) => entry.delivery.kind === 'sending')) return 'saving';
		return this.entries.length ? 'pending' : 'synced';
	}
	get lastError(): string | undefined {
		if (this.resources.uncertainWrite(this.key, this.current?.basedOn ?? null))
			return 'This item changed elsewhere. Save your edits to review the versions.';
		if (this.error) return this.error;
		const failed = this.entries.find(
			(entry) => entry.delivery.kind === 'rejected' || entry.delivery.kind === 'retry'
		);
		return failed && (failed.delivery.kind === 'rejected' || failed.delivery.kind === 'retry')
			? failed.delivery.message
			: undefined;
	}
	get conflict(): WriteConflictView<WorkspaceValues[K]> | undefined {
		const entry = this.entries.find((entry) => entry.delivery.kind === 'conflict');
		if (!entry || entry.delivery.kind !== 'conflict') return undefined;
		const remote = entry.delivery.remote;
		return {
			base: entry.intent.base ? this.valueOf(entry.intent.base.value) : null,
			local: this.value,
			remote:
				remote.kind === 'found'
					? { kind: 'found', value: this.valueOf(remote.snapshot.value) }
					: remote
		};
	}
	/** Capture the base of a form that is already rendered; this performs no resource read. */
	capture(): void {
		this.current = this.resources.editBase(this.identity);
	}

	/** Capture a rendered optional value without awaiting a newer, unseen server version. */
	captureOrCreate(initial: WorkspaceRecord): void {
		if (workspaceResourceKey(workspaceRecordIdentity(initial)) !== this.key)
			throw new Error('The initial value belongs to a different resource');
		const state = this.resources.state(this.identity);
		const pending = this.resources.pending.some((entry) => entry.intent.key === this.key);
		if (pending || state?.kind === 'present') this.capture();
		else if (state?.kind === 'deleted' || this.resources.availability !== 'unknown')
			this.current = { base: null, basedOn: null, local: initial };
		else throw new Error('This resource is not available on this device');
	}

	read(): Promise<CacheAccess<WorkspaceValues[K]>>;
	read(isCurrent: () => boolean): Promise<CacheAccess<WorkspaceValues[K]> | { kind: 'superseded' }>;
	async read(
		isCurrent: () => boolean = () => true
	): Promise<CacheAccess<WorkspaceValues[K]> | { kind: 'superseded' }> {
		this.error = null;
		try {
			const opened = await this.resources.open(this.identity);
			if (!isCurrent()) return { kind: 'superseded' };
			if (opened.kind !== 'ready') {
				this.error =
					opened.kind === 'failure'
						? opened.message
						: 'This resource is not available on this device';
				return opened;
			}
			this.current = this.resources.editBase(this.identity);
			return { kind: 'ready', value: this.valueOf(this.current.local) };
		} catch (error) {
			if (!isCurrent()) return { kind: 'superseded' };
			this.error = error instanceof Error ? error.message : 'Device storage is unavailable';
			return { kind: 'failure', message: this.error };
		}
	}
	/** An optional form may start a new resource only after absence is established. */
	async readOrCreate(initial: WorkspaceRecord): Promise<CacheAccess<WorkspaceValues[K]>> {
		this.error = null;
		try {
			if (workspaceResourceKey(workspaceRecordIdentity(initial)) !== this.key)
				throw new Error('The initial value belongs to a different resource');
			const opened = await this.resources.lookup(this.identity);
			if (opened.kind === 'ready') {
				this.current = this.resources.editBase(this.identity);
			} else if (opened.kind === 'absent' || opened.kind === 'deleted') {
				this.current = { base: null, basedOn: null, local: initial };
			} else {
				this.error =
					opened.kind === 'failure'
						? opened.message
						: 'This resource is not available on this device';
				return opened;
			}
			return { kind: 'ready', value: this.valueOf(this.current.local) };
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Device storage is unavailable';
			return { kind: 'failure', message: this.error };
		}
	}

	stage(
		content: WriteContent<WorkspaceCommand, WorkspaceRecord>
	): ReturnType<WorkspaceDraft<K>['save']> {
		this.savingLocal++;
		const operation = this.staging
			.then(() => this.save(content))
			.finally(() => {
				this.savingLocal--;
			});
		this.staging = operation.then(() => undefined);
		return operation;
	}
	private async save(
		content: WriteContent<WorkspaceCommand, WorkspaceRecord>
	): Promise<
		{ kind: 'saved'; value: WorkspaceValues[K] | null } | { kind: 'failure'; message: string }
	> {
		this.error = null;
		try {
			const context = this.current;
			if (!context) throw new Error('Open the resource before editing');
			if (workspaceResourceKey(mutationResource(content.command)) !== this.key)
				throw new Error('The edit belongs to a different resource');
			if (content.local) this.valueOf(content.local);
			const operationId = await this.resources.append({
				...content,
				operationId: crypto.randomUUID(),
				key: this.key,
				base: context.base,
				basedOn: context.basedOn
			});
			this.current = { ...context, basedOn: operationId, local: content.local ?? context.local };
			return { kind: 'saved', value: this.value };
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'The local edit could not be saved';
			return { kind: 'failure', message: this.error };
		}
	}
	async retry(): Promise<void> {
		this.error = null;
		if (!this.current) await this.read();
		await this.resources.synchronize(true);
	}
	async keep(): Promise<void> {
		const conflict = this.entries.find((entry) => entry.delivery.kind === 'conflict');
		if (!conflict) throw new Error('This resource has no unresolved conflict');
		const replacementId = await this.resources.keepLocal(conflict.intent.operationId);
		if (
			this.current?.basedOn === conflict.intent.operationId &&
			conflict.delivery.kind === 'conflict' &&
			conflict.delivery.remote.kind === 'found'
		) {
			this.current = {
				...this.current,
				basedOn: replacementId,
				base: conflict.delivery.remote.snapshot
			};
		}
		await this.resources.synchronize();
	}
	async discard(): Promise<CacheAccess<WorkspaceValues[K]>> {
		const reviewed = this.entries;
		const conflict = reviewed.find((entry) => entry.delivery.kind === 'conflict');
		const state = this.resources.state(this.identity);
		const snapshot = this.resources.snapshot(this.identity);
		if (state?.kind !== 'deleted') {
			if (!snapshot) throw new Error('Download the server copy before discarding the local edit');
			if (conflict?.delivery.kind === 'conflict' && conflict.delivery.remote.kind === 'found') {
				const observed = conflict.delivery.remote.snapshot;
				if (
					observed.etag !== null
						? compareSyncEtags(snapshot.etag, observed.etag) < 0
						: !this.resources.online || this.resources.readStatus.kind !== 'complete'
				)
					throw new Error('Reconnect to validate the server copy before discarding the local edit');
			}
		}
		await this.resources.discard(reviewed.map((entry) => entry.intent.operationId));
		if (state?.kind === 'deleted') {
			this.current = null;
			return { kind: 'deleted' };
		}
		return this.read();
	}
}
