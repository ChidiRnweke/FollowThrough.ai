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
	isWorkspaceRecord,
	type WorkspaceValues,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import {
	workspaceCommandSchema,
	mutationResource,
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
	compareSyncEtags,
	type CacheAccess,
	type SyncSnapshot
} from '$lib/models/sync';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { IndexedDbSyncCache } from '$lib/client/sync/indexeddb-cache';
import { IndexedDbOutbox } from '$lib/client/sync/indexeddb-outbox';
import { migrateLegacyNotes } from '$lib/client/sync/legacy-notes';
import { browserWriterLock } from '$lib/client/sync/browser-writer-lock';
import {
	workspaceReadTransport,
	workspaceWriteTransport
} from '$lib/client/sync/workspace-transport';

const plain = <T>(value: T): T => $state.snapshot(value) as T;

export interface WorkspaceResourcesDependencies {
	restoreLocalWrites(): Promise<void>;
	cache: ResourceCache<WorkspaceRecord>;
	writes: MutationQueue<WorkspaceCommand, WorkspaceRecord>;
}

/** Features share resource identity, local overlays, and the same explicit-open read barrier. */
export class WorkspaceResources {
	private revision = $state(0);
	private connected = $state(true);
	get active(): boolean {
		return !this.stopped;
	}
	get online(): boolean {
		return this.connected;
	}
	private readonly unsubscribe: (() => void)[];
	private syncing: Promise<void> | null = null;
	private requested = false;
	private stopped = false;
	private failure = $state<{ kind: 'failure'; message: string } | null>(null);
	private initializing: Promise<void> | null = null;
	constructor(
		readonly accountId: string,
		private readonly dependencies: WorkspaceResourcesDependencies
	) {
		this.unsubscribe = [
			dependencies.cache.subscribe(() => {
				this.revision++;
			}),
			dependencies.writes.subscribe(() => {
				this.revision++;
			})
		];
	}
	draft<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K }
	): WorkspaceDraft<K> {
		return new WorkspaceDraft<K>(this, identity);
	}

	get records(): ReadonlyMap<string, WorkspaceRecord> {
		void this.revision;
		return visibleResources(this.dependencies.cache.records, this.dependencies.writes.pending);
	}
	get views(): WorkspaceViews {
		return new WorkspaceViews(this.records);
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
		await Promise.all(missing.map(([key]) => this.dependencies.cache.open(key)));
	}
	async open(identity: WorkspaceResourceIdentity): Promise<CacheAccess<WorkspaceRecord>> {
		await this.initialize();
		const key = workspaceResourceKey(identity);
		const local = localResource(this.dependencies.writes.pending, key);
		if (local) return local;
		const result = await this.dependencies.cache.open(key);
		return localResource(this.dependencies.writes.pending, key) ?? result;
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
	async keepLocal(operationId: string): Promise<string> {
		return this.dependencies.writes.keepLocal(operationId);
	}
	async discard(operationIds: readonly string[]): Promise<void> {
		await this.dependencies.writes.discard(operationIds);
	}

	async append(draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>): Promise<string> {
		// IndexedDB cannot clone a Svelte proxy; snapshot once at the shared UI boundary.
		await this.initialize();
		const operationId = await this.dependencies.writes.append(plain(draft));
		void this.synchronize();
		return operationId;
	}
	setOnline(online: boolean): void {
		this.connected = online;
		this.dependencies.cache.setOnline(online);
		this.dependencies.writes.setOnline(online);
	}
	synchronize(): Promise<void> {
		this.requested = true;
		this.syncing ??= this.synchronizeResources()
			.catch((error) => {
				if (!this.stopped)
					this.failure = {
						kind: 'failure',
						message: error instanceof Error ? error.message : 'Workspace synchronization failed'
					};
				return { kind: 'failure' };
			})
			.then(() => undefined)
			.finally(() => {
				this.syncing = null;
				if (this.requested && !this.stopped) void this.synchronize();
			});
		return this.syncing;
	}
	stop(): void {
		this.stopped = true;
		this.dependencies.cache.stop();
		this.dependencies.writes.stop();
		for (const unsubscribe of this.unsubscribe) unsubscribe();
	}
	private async synchronizeResources(): Promise<void> {
		do {
			this.requested = false;
			await this.initialize();
			if (this.stopped) return;
			this.failure = null;
			await this.dependencies.writes.flush();
			await this.dependencies.cache.refresh();
			await this.dependencies.cache.warm();
		} while (this.requested && !this.stopped);
	}
}

export const createWorkspaceResources = (accountId: string): WorkspaceResources => {
	const cache = new ResourceCache(accountId, {
		repository: new IndexedDbSyncCache(workspaceRecordSchema),
		transport: workspaceReadTransport(accountId)
	});
	const repository = new IndexedDbOutbox(workspaceCommandSchema, workspaceRecordSchema);
	const writes = new MutationQueue(accountId, {
		repository,
		transport: workspaceWriteTransport(accountId),
		writerLock: browserWriterLock,
		resolveBase: async (key, base, local) => {
			const remote = await workspaceReadTransport(accountId).read(key, null);
			if (remote.kind === 'unchanged')
				throw new Error('An imported base requires a complete server representation');
			return resolveImportedNoteBase(base, local, remote);
		},
		received: async (key, resource) => {
			await cache.accept(key, resource.kind === 'found' ? resource.snapshot : resource);
		}
	});
	return new WorkspaceResources(accountId, {
		cache,
		writes,
		restoreLocalWrites: () =>
			browserWriterLock.run(accountId, () => migrateLegacyNotes(accountId, repository))
	});
};

type EditContext = ReturnType<WorkspaceResources['editBase']>;
/** An editor's observed base, not another resource cache. All persistence and delivery use its workspace. */
export class WorkspaceDraft<K extends WorkspaceResourceType> {
	private current = $state<EditContext | null>(null);
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
		if (!this.entries.length && this.resources.state(this.identity)?.kind === 'deleted')
			return null;
		const last = this.entries.at(-1);
		const record = last ? last.intent.local : this.current?.local;
		return record ? this.valueOf(record) : null;
	}
	get status(): DraftStatus {
		if (this.error) return 'error';
		if (!this.current) return 'loading';
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

	async read(): Promise<CacheAccess<WorkspaceValues[K]>> {
		this.error = null;
		try {
			const opened = await this.resources.open(this.identity);
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
			this.error = error instanceof Error ? error.message : 'Device storage is unavailable';
			return { kind: 'failure', message: this.error };
		}
	}
	async stage(
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
		await this.resources.synchronize();
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
		if (this.resources.online) await this.resources.synchronize();
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
