import { type NoteId, type NoteView } from '$lib/models/notes';
import {
	visibleResources,
	localResource,
	type WriteDraft,
	type WriteBase
} from '$lib/models/outbox';
import { workspaceRecordSchema, type WorkspaceRecord } from '$lib/models/workspace-records';
import {
	workspaceCommandSchema,
	resolveImportedNoteBase,
	type WorkspaceCommand
} from '$lib/models/workspace-mutations';
import {
	workspaceResourceKey,
	type WorkspaceResourceType,
	type WorkspaceResourceIdentity
} from '$lib/models/workspace-sync';
import { WorkspaceViews } from '$lib/models/workspace-views';
import { cachedSnapshot, type CacheAccess, type SyncSnapshot } from '$lib/models/sync';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { IndexedDbSyncCache } from '$lib/client/sync/indexeddb-cache';
import { IndexedDbOutbox } from '$lib/client/sync/indexeddb-outbox';
import { browserWriterLock } from '$lib/client/sync/browser-writer-lock';
import {
	workspaceReadTransport,
	workspaceWriteTransport
} from '$lib/client/sync/workspace-transport';

const plain = <T>(value: T): T => $state.snapshot(value) as T;

export interface WorkspaceResourcesDependencies {
	cache: ResourceCache<WorkspaceRecord>;
	writes: MutationQueue<WorkspaceCommand, WorkspaceRecord>;
}

/** Features share resource identity, local overlays, and the same explicit-open read barrier. */
export class WorkspaceResources {
	private revision = $state(0);
	private connected = $state(true);
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
		this.initializing ??= Promise.all([
			this.dependencies.cache.initialize(),
			this.dependencies.writes.reload()
		])
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
	snapshot(identity: WorkspaceResourceIdentity): SyncSnapshot<WorkspaceRecord> | null {
		void this.revision;
		const entry = this.dependencies.cache.records.get(workspaceResourceKey(identity));
		return entry?.kind === 'present' ? cachedSnapshot(entry.cache) : null;
	}
	async keepLocal(operationId: string): Promise<void> {
		await this.dependencies.writes.keepLocal(operationId);
		void this.synchronize();
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
	const writes = new MutationQueue(accountId, {
		repository: new IndexedDbOutbox(workspaceCommandSchema, workspaceRecordSchema),
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
	return new WorkspaceResources(accountId, { cache, writes });
};
