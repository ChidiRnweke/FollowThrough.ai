import type { Note, NoteSyncRecord, NoteSyncStatus, VersionedNote } from '$lib/models';
import { NoteSyncCoordinator } from '$lib/client/note-sync/coordinator';
import { IndexedDbNoteSyncRepository } from '$lib/client/note-sync/indexeddb-note-sync-repository';
import { RemoteNoteSyncTransport } from '$lib/client/note-sync/remote-note-sync-transport';

const statusFor = (record: NoteSyncRecord): NoteSyncStatus => {
	if (record.state === 'syncing') return 'saving';
	if (record.state === 'pending') return 'pending';
	return record.state;
};

class NoteSyncStore {
	status = $state<NoteSyncStatus>('loading');
	record = $state<NoteSyncRecord | undefined>(undefined);
	lastError = $state<string | undefined>(undefined);

	private readonly repository = new IndexedDbNoteSyncRepository();
	private readonly coordinator = new NoteSyncCoordinator(
		this.repository,
		new RemoteNoteSyncTransport()
	);

	async initialize(server: VersionedNote): Promise<Note> {
		this.status = 'loading';
		this.lastError = undefined;
		try {
			this.setRecord(await this.coordinator.open(server));
			if (this.record?.state === 'pending') await this.retry();
			return this.record?.local ?? server.note;
		} catch (error) {
			this.status = 'error';
			this.lastError = error instanceof Error ? error.message : 'Device storage is unavailable.';
			return server.note;
		}
	}

	async save(note: Note): Promise<NoteSyncRecord | undefined> {
		this.lastError = undefined;
		try {
			this.setRecord(await this.coordinator.stage(note));
			return await this.retry();
		} catch (error) {
			this.status = 'error';
			this.lastError = error instanceof Error ? error.message : 'The note could not be saved.';
			return undefined;
		}
	}

	async retry(): Promise<NoteSyncRecord | undefined> {
		if (!this.record || this.record.state === 'conflict') return this.record;
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
	}

	private setRecord(record: NoteSyncRecord | undefined): void {
		this.record = record;
		if (record) this.status = statusFor(record);
	}
}

export const noteSync = new NoteSyncStore();
