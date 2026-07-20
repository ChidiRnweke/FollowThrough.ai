import { describe, expect, it } from 'vitest';
import { noteEtag, type NoteSyncRecord, type SyncNoteOutput } from '$lib/models';
import { noteBuilder } from '$lib/testing/fixtures/domain-builders';
import {
	InMemoryNoteSyncRepository,
	InMemoryNoteSyncTransport
} from '$lib/testing/fakes/in-memory-note-sync';
import { NoteSyncCoordinator } from './coordinator';

const setup = () => {
	const repository = new InMemoryNoteSyncRepository();
	const transport = new InMemoryNoteSyncTransport();
	return { repository, transport, coordinator: new NoteSyncCoordinator(repository, transport) };
};

const pendingRecord = (): NoteSyncRecord => {
	const base = noteBuilder();
	return {
		userId: base.userId,
		noteId: base.id,
		base: { note: base, etag: noteEtag(base) },
		local: { ...base, plainText: 'Local' },
		operationId: crypto.randomUUID(),
		editVersion: 1,
		state: 'pending',
		updatedAt: base.updatedAt
	};
};

describe('Local note synchronization invariants', () => {
	it('does not downgrade a synced device record from a stale cached loader', async () => {
		const { coordinator } = setup();
		const current = noteBuilder({ currentRevision: 3, plainText: 'Current' });
		await coordinator.open({ note: current, etag: noteEtag(current) });
		const stale = noteBuilder({ currentRevision: 2, plainText: 'Stale' });
		const result = await coordinator.open({ note: stale, etag: noteEtag(stale) });
		expect(result.base.etag).toBe(noteEtag(current));
	});

	it('does not turn pending work into a conflict from a stale cached loader', async () => {
		const { coordinator, repository } = setup();
		const base = noteBuilder({ currentRevision: 3, plainText: 'Current' });
		await repository.put({
			userId: base.userId,
			noteId: base.id,
			base: { note: base, etag: noteEtag(base) },
			local: { ...base, plainText: 'Pending' },
			operationId: crypto.randomUUID(),
			editVersion: 1,
			state: 'pending',
			updatedAt: base.updatedAt
		});
		const stale = noteBuilder({ currentRevision: 2, plainText: 'Stale' });
		const result = await coordinator.open({ note: stale, etag: noteEtag(stale) });
		expect(result.state).toBe('pending');
	});

	it('stages local content before attempting synchronization', async () => {
		const { coordinator, repository } = setup();
		const base = noteBuilder();
		await coordinator.open({ note: base, etag: noteEtag(base) });
		await coordinator.stage({ ...base, plainText: 'Local' });
		const stored = await repository.get(base.userId, base.id);
		expect(stored?.state).toBe('pending');
	});

	it('keeps the original base while repeated edits coalesce', async () => {
		const { coordinator, repository } = setup();
		const base = noteBuilder();
		await coordinator.open({ note: base, etag: noteEtag(base) });
		await coordinator.stage({ ...base, plainText: 'First' });
		await coordinator.stage({ ...base, plainText: 'Second' });
		const stored = await repository.get(base.userId, base.id);
		expect(stored?.base.note.plainText).toBe(base.plainText);
	});

	it('retains pending work when transport is unavailable', async () => {
		const { coordinator, repository, transport } = setup();
		const pending = pendingRecord();
		await repository.put(pending);
		transport.failure = new Error('Offline');
		const result = await coordinator.flush(pending.userId, pending.noteId);
		expect(result?.state).toBe('pending');
	});

	it('never sends a poisoned local revision and base ETag pair', async () => {
		const { coordinator, repository, transport } = setup();
		const pending = pendingRecord();
		const poisoned = {
			...pending,
			local: { ...pending.local, currentRevision: pending.local.currentRevision + 1 }
		};
		await repository.put(poisoned);
		transport.version = { note: pending.base.note, etag: pending.base.etag };
		const result = await coordinator.flush(pending.userId, pending.noteId);
		expect(result?.state).toBe('conflict');
	});

	it('converges a poisoned record when its content already matches the server', async () => {
		const { coordinator, repository, transport } = setup();
		const pending = pendingRecord();
		const authoritative = {
			...pending.local,
			currentRevision: pending.local.currentRevision + 1
		};
		await repository.put({ ...pending, local: authoritative });
		transport.version = { note: authoritative, etag: noteEtag(authoritative) };
		const result = await coordinator.flush(pending.userId, pending.noteId);
		expect(result?.state).toBe('synced');
	});

	it('adopts same-revision server metadata when reopening a synced note', async () => {
		const { coordinator } = setup();
		const original = noteBuilder({ position: 0 });
		await coordinator.open({ note: original, etag: noteEtag(original) });
		const moved = { ...original, position: 4 };
		const result = await coordinator.open({ note: moved, etag: noteEtag(moved) });
		expect(result.local.position).toBe(4);
	});

	it('detects divergence when reopening a pending device copy', async () => {
		const { coordinator, repository } = setup();
		const pending = pendingRecord();
		await repository.put(pending);
		const remote = noteBuilder({ currentRevision: 2, plainText: 'Remote' });
		const result = await coordinator.open({ note: remote, etag: noteEtag(remote) });
		expect([
			result.state,
			result.base.note.plainText,
			result.local.plainText,
			result.remote?.note.plainText
		]).toEqual(['conflict', pending.base.note.plainText, 'Local', 'Remote']);
	});

	it('adopts the server version after an accepted save', async () => {
		const { coordinator, repository, transport } = setup();
		const pending = pendingRecord();
		await repository.put(pending);
		const saved = noteBuilder({ currentRevision: 2, plainText: 'Local' });
		transport.output = {
			outcome: 'saved',
			version: { note: saved, etag: noteEtag(saved) },
			repairedAnchorIds: []
		};
		await coordinator.flush(pending.userId, pending.noteId);
		const stored = await repository.get(pending.userId, pending.noteId);
		expect(stored?.base.etag).toBe(noteEtag(saved));
	});

	it('preserves a newer local edit when an older save is acknowledged', async () => {
		const { coordinator, repository, transport } = setup();
		const pending = pendingRecord();
		await repository.put(pending);
		const saved = noteBuilder({ currentRevision: 2, plainText: 'Local' });
		let acknowledge: ((output: SyncNoteOutput) => void) | undefined;
		let requestStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => (requestStarted = resolve));
		transport.onSync = () =>
			new Promise((resolve) => {
				acknowledge = resolve;
				requestStarted?.();
			});
		const flushing = coordinator.flush(pending.userId, pending.noteId);
		await started;
		await coordinator.stage({ ...pending.local, plainText: 'Newer' });
		acknowledge?.({
			outcome: 'saved',
			version: { note: saved, etag: noteEtag(saved) },
			repairedAnchorIds: []
		});
		await flushing;
		const stored = await repository.get(pending.userId, pending.noteId);
		expect([stored?.local.plainText, stored?.state, stored?.base.etag]).toEqual([
			'Newer',
			'pending',
			noteEtag(saved)
		]);
	});

	it('preserves base local and remote versions on conflict', async () => {
		const { coordinator, repository, transport } = setup();
		const pending = pendingRecord();
		await repository.put(pending);
		const remote = noteBuilder({ currentRevision: 2, plainText: 'Remote' });
		transport.output = {
			outcome: 'conflict',
			baseEtag: pending.base.etag,
			remote: { note: remote, etag: noteEtag(remote) }
		};
		const result = await coordinator.flush(pending.userId, pending.noteId);
		expect([
			result?.base.note.plainText,
			result?.local.plainText,
			result?.remote?.note.plainText
		]).toEqual([pending.base.note.plainText, 'Local', 'Remote']);
	});

	it('uses the remote ETag as the next base when keeping local content', async () => {
		const { coordinator, repository } = setup();
		const pending = pendingRecord();
		const remote = noteBuilder({ currentRevision: 2, plainText: 'Remote' });
		await repository.put({
			...pending,
			state: 'conflict',
			remote: { note: remote, etag: noteEtag(remote) }
		});
		const result = await coordinator.keepLocal(pending.userId, pending.noteId);
		expect(result?.base.etag).toBe(noteEtag(remote));
	});

	it('restores the exact remote rich document when choosing remote', async () => {
		const { coordinator, repository } = setup();
		const pending = pendingRecord();
		const remote = noteBuilder({
			currentRevision: 2,
			document: { type: 'doc', content: [{ type: 'paragraph', attrs: { preserved: true } }] }
		});
		await repository.put({
			...pending,
			state: 'conflict',
			remote: { note: remote, etag: noteEtag(remote) }
		});
		const result = await coordinator.useRemote(pending.userId, pending.noteId);
		expect(result?.local.document).toEqual(remote.document);
	});
});
