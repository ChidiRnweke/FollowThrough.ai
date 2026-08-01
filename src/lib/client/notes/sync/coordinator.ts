import type { DateTime } from '$lib/models/workspace';
import type { Note, NoteId, NoteSyncRecord, VersionedNote } from '$lib/models/notes';
import type { UserId } from '$lib/models/identity';
import { noteEtag, noteMatchesEtag, noteSyncContentEquals } from '$lib/models/notes';
import type { NoteSyncRepository, NoteSyncTransport } from './contracts';

const now = (): DateTime => new Date().toISOString() as DateTime;

export class NoteSyncCoordinator {
	constructor(
		private readonly repository: NoteSyncRepository,
		private readonly transport: NoteSyncTransport
	) {}

	async open(server: VersionedNote): Promise<NoteSyncRecord> {
		const existing = await this.repository.get(server.note.userId, server.note.id);
		if (!existing) return this.store(this.syncedRecord(server));
		if (existing.base.note.currentRevision > server.note.currentRevision)
			return this.store({
				...existing,
				state: existing.state === 'syncing' ? 'pending' : existing.state
			});

		if (existing.state === 'synced') {
			if (existing.base.etag === server.etag)
				return this.store(this.syncedRecord(server, existing.editVersion));
			return this.store(this.syncedRecord(server));
		}

		if (existing.base.etag === server.etag)
			return this.store({
				...existing,
				state: existing.state === 'syncing' ? 'pending' : existing.state
			});

		if (noteSyncContentEquals(existing.local, server.note))
			return this.store(this.syncedRecord(server));

		return this.store({ ...existing, state: 'conflict', remote: server, updatedAt: now() });
	}

	async stage(note: Note): Promise<NoteSyncRecord> {
		const existing = await this.repository.get(note.userId, note.id);
		const base = existing?.base ?? { note, etag: noteEtag(note) };
		return this.store({
			userId: note.userId,
			noteId: note.id,
			base,
			local: note,
			operationId: crypto.randomUUID(),
			editVersion: (existing?.editVersion ?? 0) + 1,
			state: 'pending',
			...(existing?.remote ? { remote: existing.remote } : {}),
			updatedAt: now()
		});
	}

	async flush(userId: UserId, noteId: NoteId): Promise<NoteSyncRecord | undefined> {
		const pending = await this.repository.get(userId, noteId);
		if (!pending || (pending.state !== 'pending' && pending.state !== 'syncing')) return pending;
		if (!noteMatchesEtag(pending.local, pending.base.etag)) {
			try {
				const authoritative = await this.transport.getVersion(noteId);
				if (noteSyncContentEquals(pending.local, authoritative.note))
					return this.store(this.syncedRecord(authoritative, pending.editVersion));
				return this.store({
					...pending,
					state: 'conflict',
					remote: authoritative,
					updatedAt: now()
				});
			} catch {
				return this.store({ ...pending, state: 'pending', updatedAt: now() });
			}
		}
		const sent = await this.store({ ...pending, state: 'syncing', updatedAt: now() });
		try {
			const output = await this.transport.sync({
				note: sent.local,
				baseEtag: sent.base.etag,
				operationId: sent.operationId
			});
			const latest = (await this.repository.get(userId, noteId)) ?? sent;
			if (output.outcome === 'conflict')
				return this.store({
					...latest,
					state: 'conflict',
					remote: output.remote,
					updatedAt: now()
				});

			if (latest.editVersion === sent.editVersion)
				return this.store(this.syncedRecord(output.version, latest.editVersion));

			return this.store({
				...latest,
				base: output.version,
				local: {
					...latest.local,
					currentRevision: output.version.note.currentRevision,
					updatedAt: output.version.note.updatedAt
				},
				state: 'pending',
				remote: undefined,
				updatedAt: now()
			});
		} catch {
			const latest = (await this.repository.get(userId, noteId)) ?? sent;
			return this.store({ ...latest, state: 'pending', updatedAt: now() });
		}
	}

	async useRemote(userId: UserId, noteId: NoteId): Promise<NoteSyncRecord | undefined> {
		const record = await this.repository.get(userId, noteId);
		if (!record?.remote) return record;
		return this.store(this.syncedRecord(record.remote, record.editVersion));
	}

	async keepLocal(userId: UserId, noteId: NoteId): Promise<NoteSyncRecord | undefined> {
		const record = await this.repository.get(userId, noteId);
		if (!record?.remote) return record;
		return this.store({
			...record,
			base: record.remote,
			local: {
				...record.local,
				currentRevision: record.remote.note.currentRevision,
				updatedAt: record.remote.note.updatedAt
			},
			remote: undefined,
			operationId: crypto.randomUUID(),
			editVersion: record.editVersion + 1,
			state: 'pending',
			updatedAt: now()
		});
	}

	private syncedRecord(version: VersionedNote, editVersion = 0): NoteSyncRecord {
		return {
			userId: version.note.userId,
			noteId: version.note.id,
			base: version,
			local: version.note,
			operationId: crypto.randomUUID(),
			editVersion,
			state: 'synced',
			updatedAt: now()
		};
	}

	private async store(record: NoteSyncRecord): Promise<NoteSyncRecord> {
		await this.repository.put(record);
		return record;
	}
}
