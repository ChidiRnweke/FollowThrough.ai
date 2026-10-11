import type {
	OutboxTable,
	WorkspaceReplicaRepository
} from '$lib/client/repositories/workspace/replica';
import type { WorkspaceBootstrapRepository } from '$lib/client/repositories/workspace/bootstrap';
import type { OutboxEntry, WriteDraft, WriteReceipt } from '$lib/models/outbox';
import type { CacheCommit, ResourceState } from '$lib/models/sync';
import type { StoredBootstrap, WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import type { WorkspaceLocalProjection } from '$lib/models/workspace-local';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';

type Entry = OutboxEntry<WorkspaceCommand, WorkspaceRecord>;
type Draft = WriteDraft<WorkspaceCommand, WorkspaceRecord>;
export type WorkspaceProjection = WorkspaceLocalProjection<WorkspaceCommand, WorkspaceRecord>;
export type { OutboxTable };

/** One outbox transition's reads and writes; every call joins the same storage transaction. */
export interface OutboxUnitOfWork {
	entries(): Promise<readonly Entry[]>;
	receipt(key: string): Promise<WriteReceipt<WorkspaceRecord> | null>;
	resource(key: string): Promise<ResourceState<WorkspaceRecord> | undefined>;
	allocate(draft: Draft): Promise<number>;
	removeAllocated(sequence: number): Promise<void>;
	replace(previous: readonly Entry[], next: readonly Entry[]): Promise<void>;
	putReceipt(key: string, receipt: WriteReceipt<WorkspaceRecord>): Promise<void>;
	receiveResource(key: string, entry: ResourceState<WorkspaceRecord>): Promise<void>;
}

/** This device's copy of an account: its replica in IndexedDB and its saved startup settings. */
export interface WorkspaceStorage {
	open(accountId: string): void;
	close(accountId: string): void;
	read(accountId: string): Promise<WorkspaceProjection>;
	observe(
		accountId: string,
		changed: (projection: WorkspaceProjection) => void,
		failed: (error: Error) => void
	): () => void;
	commitCache(accountId: string, commit: CacheCommit<WorkspaceRecord>): Promise<void>;
	list(accountId: string): Promise<readonly Entry[]>;
	validate(draft: Draft): void;
	transaction<R>(
		accountId: string,
		tables: readonly OutboxTable[],
		work: (tx: OutboxUnitOfWork) => Promise<R>
	): Promise<R>;
	exportAccount(accountId: string): Promise<Blob>;
	resetAccount(accountId: string): Promise<void>;
	readBootstrap(accountHint: string | null): StoredBootstrap;
	saveBootstrap(bootstrap: WorkspaceBootstrap): void;
}

export class WorkspaceStorageService implements WorkspaceStorage {
	constructor(
		private readonly replica: WorkspaceReplicaRepository<WorkspaceCommand, WorkspaceRecord>,
		private readonly bootstrap: WorkspaceBootstrapRepository
	) {}
	open(accountId: string): void {
		this.replica.open(accountId);
	}
	close(accountId: string): void {
		this.replica.close(accountId);
	}
	read(accountId: string): Promise<WorkspaceProjection> {
		return this.replica.read(accountId);
	}
	observe(
		accountId: string,
		changed: (projection: WorkspaceProjection) => void,
		failed: (error: Error) => void
	): () => void {
		return this.replica.observe(accountId, changed, failed);
	}
	commitCache(accountId: string, commit: CacheCommit<WorkspaceRecord>): Promise<void> {
		return this.replica.commitCache(accountId, commit);
	}
	list(accountId: string): Promise<readonly Entry[]> {
		return this.replica.list(accountId);
	}
	validate(draft: Draft): void {
		this.replica.validate(draft);
	}
	transaction<R>(
		accountId: string,
		tables: readonly OutboxTable[],
		work: (tx: OutboxUnitOfWork) => Promise<R>
	): Promise<R> {
		return this.replica.transaction(accountId, tables, work);
	}
	exportAccount(accountId: string): Promise<Blob> {
		return this.replica.exportAccount(accountId);
	}
	resetAccount(accountId: string): Promise<void> {
		return this.replica.resetAccount(accountId);
	}
	readBootstrap(accountHint: string | null): StoredBootstrap {
		return this.bootstrap.read(accountHint);
	}
	saveBootstrap(bootstrap: WorkspaceBootstrap): void {
		this.bootstrap.save(bootstrap);
	}
}
