import type { Note, NoteSyncRecord, NoteSyncStatus, VersionedNote } from '$lib/models/notes';
import { NoteSyncCoordinator } from '$lib/client/notes/sync/coordinator';
import type { NoteSyncRepository, NoteSyncTransport } from '$lib/client/notes/sync/contracts';
import { IndexedDbNoteSyncRepository } from '$lib/client/notes/sync/indexeddb-note-sync-repository';
import { RemoteNoteSyncTransport } from '$lib/client/notes/sync/remote-note-sync-transport';

const statusFor = (record: NoteSyncRecord): NoteSyncStatus => {
	if (record.state === 'syncing') return 'saving';
	if (record.state === 'pending') return 'pending';
	return record.state;
};

/**
 * Everything handed to this store comes from component `$state`, so it arrives
 * as a reactive proxy.  The coordinator writes what it is given straight into
 * IndexedDB, and `IDBObjectStore.put` structured-clones its argument — which
 * throws `DataCloneError` on a proxy.  Snapshotting here, at the single boundary
 * every component crosses, keeps proxies out of the persistence layer entirely.
 */
const plain = <T>(value: T): T => $state.snapshot(value) as T;

export class NoteSyncStore {
	status = $state<NoteSyncStatus>('loading');
	record = $state<NoteSyncRecord | undefined>(undefined);
	lastError = $state<string | undefined>(undefined);

	private readonly coordinator: NoteSyncCoordinator;
	/**
	 * The last server version this store was opened with.  Kept so `retry` can
	 * rebuild a record after a failed `initialize`, which would otherwise leave
	 * the store in a permanently unrecoverable `error` state with no record.
	 */
	private lastServerVersion: VersionedNote | undefined;

	constructor(
		repository: NoteSyncRepository = new IndexedDbNoteSyncRepository(),
		transport: NoteSyncTransport = new RemoteNoteSyncTransport()
	) {
		this.coordinator = new NoteSyncCoordinator(repository, transport);
	}

	async initialize(server: VersionedNote): Promise<Note> {
		const version = plain(server);
		this.lastServerVersion = version;
		this.status = 'loading';
		this.lastError = undefined;
		try {
			this.setRecord(await this.coordinator.open(version));
			if (this.record?.state === 'pending') await this.retry();
			return this.record?.local ?? version.note;
		} catch (error) {
			this.status = 'error';
			this.lastError = error instanceof Error ? error.message : 'Device storage is unavailable.';
			return version.note;
		}
	}

	async save(note: Note): Promise<NoteSyncRecord | undefined> {
		this.lastError = undefined;
		try {
			this.setRecord(await this.coordinator.stage(plain(note)));
			return await this.retry();
		} catch (error) {
			this.status = 'error';
			this.lastError = error instanceof Error ? error.message : 'The note could not be saved.';
			return undefined;
		}
	}

	async retry(): Promise<NoteSyncRecord | undefined> {
		// A missing record means `initialize` failed outright; reopening is the
		// only way back, so retry has to mean "open again" rather than "no-op".
		if (!this.record) {
			if (!this.lastServerVersion) return undefined;
			await this.initialize(this.lastServerVersion);
			return this.record;
		}
		// A conflict is the user's decision to make, not something to re-send.
		if (this.record.state === 'conflict') return this.record;
		this.status = 'saving';
		try {
			this.setRecord(await this.coordinator.flush(this.record.userId, this.record.noteId));
			return this.record;
		} catch (error) {
			this.status = 'error';
			this.lastError = error instanceof Error ? error.message : 'Synchronization failed.';
			return this.record;
		}
	}

	async useRemote(): Promise<Note | undefined> {
		if (!this.record) return undefined;
		this.setRecord(await this.coordinator.useRemote(this.record.userId, this.record.noteId));
		return this.record?.local;
	}

	async keepLocal(): Promise<NoteSyncRecord | undefined> {
		if (!this.record) return undefined;
		this.setRecord(await this.coordinator.keepLocal(this.record.userId, this.record.noteId));
		return this.retry();
	}

	listenForReconnect(): () => void {
		if (typeof window === 'undefined') return () => undefined;
		const retry = () => void this.retry();
		const retryWhenVisible = () => {
			if (document.visibilityState === 'visible') void this.retry();
		};
		window.addEventListener('online', retry);
		document.addEventListener('visibilitychange', retryWhenVisible);
		return () => {
			window.removeEventListener('online', retry);
			document.removeEventListener('visibilitychange', retryWhenVisible);
		};
	}

	reset(): void {
		this.record = undefined;
		this.status = 'loading';
		this.lastError = undefined;
		this.lastServerVersion = undefined;
	}

	private setRecord(record: NoteSyncRecord | undefined): void {
		this.record = record;
		if (record) this.status = statusFor(record);
	}
}

export const noteSync = new NoteSyncStore();

/**
 * @deprecated Use `noteSyncRegistry.for(noteId)` instead.  The bare singleton
 * remains only as a transitional helper for code paths that have not been
 * wired through the workbench yet.
 */
