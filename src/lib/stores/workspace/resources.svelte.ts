import { visibleResources, localResource, type WriteDraft } from '$lib/models/outbox';
import { workspaceRecordSchema, type WorkspaceRecord } from '$lib/models/workspace-records';
import { workspaceCommandSchema, type WorkspaceCommand } from '$lib/models/workspace-mutations';
import { workspaceResourceKey, type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import { WorkspaceViews } from '$lib/models/workspace-views';
import type { CacheAccess } from '$lib/models/sync';
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
	private readonly unsubscribe: (() => void)[];
	private syncing: Promise<void> | null = null;
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
		return this.dependencies.cache.status;
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
	async open(identity: WorkspaceResourceIdentity): Promise<CacheAccess<WorkspaceRecord>> {
		await this.initialize();
		const key = workspaceResourceKey(identity);
		const local = localResource(this.dependencies.writes.pending, key);
		if (local) return local;
		const result = await this.dependencies.cache.open(key);
		return localResource(this.dependencies.writes.pending, key) ?? result;
	}
	async append(draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>): Promise<string> {
		// IndexedDB cannot clone a Svelte proxy; snapshot once at the shared UI boundary.
		return this.dependencies.writes.append(plain(draft));
	}
	setOnline(online: boolean): void {
		this.dependencies.cache.setOnline(online);
		this.dependencies.writes.setOnline(online);
	}
	synchronize(): Promise<void> {
		this.syncing ??= this.synchronizeResources().finally(() => {
			this.syncing = null;
		});
		return this.syncing;
	}
	stop(): void {
		this.dependencies.cache.stop();
		this.dependencies.writes.stop();
		for (const unsubscribe of this.unsubscribe) unsubscribe();
	}
	private async synchronizeResources(): Promise<void> {
		await this.initialize();
		await this.dependencies.writes.flush();
		await this.dependencies.cache.refresh();
		await this.dependencies.cache.warm();
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
		accepted: async (key, receipt) => {
			const resource = receipt.resource;
			await cache.accept(key, resource.kind === 'found' ? resource.snapshot : resource);
		}
	});
	return new WorkspaceResources(accountId, { cache, writes });
};
