import { describe, expect, it } from 'vitest';
import { noteEtag, type NoteSyncRecord, type VersionedNote } from '$lib/models';
import { noteBuilder } from '$lib/testing/fixtures/domain-builders';
import {
	InMemoryNoteSyncRepository,
	InMemoryNoteSyncTransport
} from '$lib/testing/fakes/in-memory-note-sync';
import { NoteSyncStore } from './note-sync.svelte';

/** Fails writes on demand, the way unavailable device storage does. */
class UnreliableRepository extends InMemoryNoteSyncRepository {
	failure?: Error;

	override async put(record: NoteSyncRecord): Promise<void> {
		if (this.failure) throw this.failure;
		return super.put(record);
	}
}

const serverVersion = (): VersionedNote => {
	const note = noteBuilder({ currentRevision: 3, plainText: 'Server' });
	return { note, etag: noteEtag(note) };
};

const pendingRecord = (version: VersionedNote): NoteSyncRecord => ({
	userId: version.note.userId,
	noteId: version.note.id,
	base: version,
	local: { ...version.note, plainText: 'Local' },
	operationId: crypto.randomUUID(),
	editVersion: 1,
	state: 'pending',
	updatedAt: version.note.updatedAt
});

const setup = () => {
	const repository = new UnreliableRepository();
	const transport = new InMemoryNoteSyncTransport();
	return { repository, transport, store: new NoteSyncStore(repository, transport) };
};

describe('Note synchronization store', () => {
	// Components hand this store their `$state`, so the server version arrives as a
	// reactive proxy.  Persisting one throws `DataCloneError`, which used to leave
	// every reopened note stuck in `error` with no record and no way back.
	it('adopts a server version that arrives as reactive state', async () => {
		const { store } = setup();
		const version = $state(serverVersion());
		await store.initialize(version);
		expect(store.status).toBe('synced');
	});

	it('reports the local content of a server version that arrives as reactive state', async () => {
		const { store } = setup();
		const version = $state(serverVersion());
		const local = await store.initialize(version);
		expect(local.plainText).toBe('Server');
	});

	it('recovers on retry after initialization failed', async () => {
		const { store, repository } = setup();
		repository.failure = new Error('Device storage is unavailable');
		await store.initialize(serverVersion());
		repository.failure = undefined;
		await store.retry();
		expect(store.status).toBe('synced');
	});

	it('leaves a conflicting record for the user to resolve', async () => {
		const { store, repository, transport } = setup();
		const version = serverVersion();
		await repository.put(pendingRecord(version));
		const remote = noteBuilder({ currentRevision: 4, plainText: 'Remote' });
		transport.output = {
			outcome: 'conflict',
			baseEtag: version.etag,
			remote: { note: remote, etag: noteEtag(remote) }
		};
		await store.initialize(version);
		expect(store.status).toBe('conflict');
	});

	it('does not re-send a conflict on retry', async () => {
		const { store, repository, transport } = setup();
		const version = serverVersion();
		await repository.put(pendingRecord(version));
		const remote = noteBuilder({ currentRevision: 4, plainText: 'Remote' });
		transport.output = {
			outcome: 'conflict',
			baseEtag: version.etag,
			remote: { note: remote, etag: noteEtag(remote) }
		};
		await store.initialize(version);
		transport.failure = new Error('The conflict must not be re-sent');
		await store.retry();
		expect(store.status).toBe('conflict');
	});
});
