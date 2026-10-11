import type {
	ResourceChange,
	SyncCursor,
	SyncObjectRead,
	SyncPage,
	SyncSnapshot
} from '$lib/models/sync';

/** A controllable network connection, with bodies delivered over that connection as evidence. */
export class InMemorySyncTransport<T> {
	readonly records = new Map<string, SyncSnapshot<T>>();
	readonly deliveredBodies: string[] = [];
	readonly readSnapshots = new Map<string, SyncSnapshot<T>>();
	readBudget = Infinity;
	maxConcurrentReads = Infinity;
	private activeReads = 0;
	pullFailure: string | null = null;
	readFailure: string | null = null;
	pageSize: number | null = null;
	private readonly paused = new Map<string, { start: () => void; ready: Promise<void> }>();

	pause(key: string): { started: Promise<void>; release: () => void } {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.paused.set(key, { start: started.resolve, ready: ready.promise });
		return { started: started.promise, release: ready.resolve };
	}

	private cursor = 0n;
	private readonly versions = new Map<string, SyncSnapshot<T>['etag']>();
	private readonly changes = new Map<string, { cursor: bigint; change: ResourceChange }>();

	async pull(since: SyncCursor): Promise<SyncPage<T>> {
		if (this.pullFailure) throw new Error(this.pullFailure);
		for (const [key, snapshot] of this.records) {
			if (this.versions.get(key) === snapshot.etag) continue;
			this.versions.set(key, snapshot.etag);
			this.changes.set(key, {
				cursor: ++this.cursor,
				change: { kind: 'upsert', key, etag: snapshot.etag }
			});
		}
		for (const [key, etag] of this.versions) {
			if (this.records.has(key)) continue;
			this.versions.delete(key);
			this.changes.set(key, { cursor: ++this.cursor, change: { kind: 'delete', key, etag } });
		}
		const changes = [...this.changes.values()]
			.filter((item) => item.cursor > BigInt(since))
			.sort((a, b) => (a.cursor < b.cursor ? -1 : 1));
		const selected = this.pageSize === null ? changes : changes.slice(0, this.pageSize);
		const hasMore = selected.length < changes.length;
		const records: SyncPage<T>['records'] = selected.map(({ change }) => {
			if (change.kind === 'delete')
				return { key: change.key, resource: { kind: 'deleted', etag: change.etag } };
			const snapshot = this.records.get(change.key);
			if (!snapshot) throw new Error('The journal resource is missing');
			const failure = this.failures.get(change.key);
			if (failure) throw new Error(failure);
			return { key: change.key, resource: { kind: 'found', snapshot } };
		});
		const page = {
			cursor: String(hasMore ? selected.at(-1)!.cursor : this.cursor) as SyncCursor,
			hasMore,
			records
		};
		await this.wait('changes');
		this.deliveredBodies.push(
			...records.filter((row) => row.resource.kind === 'found').map((row) => row.key)
		);
		return page;
	}

	async read(key: string, etag: SyncSnapshot<T>['etag'] | null): Promise<SyncObjectRead<T>> {
		if (--this.readBudget < 0) throw new Error('Transport capacity exhausted without progress');
		const snapshot = this.readSnapshots.get(key) ?? this.records.get(key);
		if (this.activeReads >= this.maxConcurrentReads) throw new Error('Download capacity exceeded');
		this.activeReads++;
		try {
			await this.wait(key);
		} finally {
			this.activeReads--;
		}
		if (this.readFailure) throw new Error(this.readFailure);
		if (!snapshot) return { kind: 'unavailable' };
		if (snapshot.etag === etag) return { kind: 'unchanged', etag };
		this.deliveredBodies.push(key);
		return { kind: 'found', snapshot };
	}

	readonly failures = new Map<string, string>();
	private async wait(key: string): Promise<void> {
		const paused = this.paused.get(key);
		if (!paused) return;
		this.paused.delete(key);
		paused.start();
		await paused.ready;
	}
}

/** Named batch fixture retained for focused download scenarios. */
export { InMemorySyncTransport as InMemoryBatchSyncTransport };
