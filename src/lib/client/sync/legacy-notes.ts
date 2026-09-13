import { z } from 'zod';
import {
	legacyNoteSyncRecordSchema,
	legacyNoteImport,
	type LegacyNoteImport,
	type WorkspaceCommand
} from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { IndexedDbOutbox } from './indexeddb-outbox';
import { completed, requestValue } from './database';
import { IndexedDbStorageRecovery } from './storage-recovery';

/** Upgrading the old database prevents a still-open version-two writer racing the migration. */
const openLegacyDatabase = (name: string): Promise<IDBDatabase> =>
	new Promise((resolve, reject) => {
		const request = indexedDB.open(name, 3);
		let blocked = false;
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains('note-sync-records'))
				database.createObjectStore('note-sync-records', { keyPath: 'key' });
			if (!database.objectStoreNames.contains('workspace'))
				database.createObjectStore('workspace', { keyPath: 'id' });
		};
		request.onsuccess = () => {
			if (blocked) {
				request.result.close();
				return;
			}
			request.result.onversionchange = () => request.result.close();
			resolve(request.result);
		};
		request.onerror = () =>
			reject(request.error ?? new Error('The saved note drafts could not be opened'));
		request.onblocked = () => {
			blocked = true;
			reject(
				new Error('Close older app tabs after saving their notes, then retry the workspace upgrade')
			);
		};
	});

export const readLegacyNoteImports = async (
	accountId: string,
	databaseName = 'followthrough-note-sync',
	recovery = new IndexedDbStorageRecovery()
): Promise<readonly LegacyNoteImport[]> => {
	const database = await openLegacyDatabase(databaseName);
	try {
		const transaction = database.transaction('note-sync-records', 'readonly');
		const done = completed(transaction);
		const [stored] = await Promise.all([
			requestValue(
				transaction
					.objectStore('note-sync-records')
					.getAll(IDBKeyRange.bound(`${accountId}:`, `${accountId}:\uffff`))
			),
			done
		]);
		const schema = z
			.object({ key: z.string(), record: legacyNoteSyncRecordSchema })
			.refine(
				(row) => row.record.userId === accountId && row.key === `${accountId}:${row.record.noteId}`,
				'A saved draft has an inconsistent account key'
			);
		const imports: LegacyNoteImport[] = [];
		for (const row of stored) {
			const parsed = schema.safeParse(row);
			if (!parsed.success) {
				const identity = z.object({ key: z.string() }).parse(row);
				await recovery.save(
					{
						accountId,
						source: 'legacy-note',
						key: identity.key,
						message:
							'An older saved edit could not be imported. Download the original before resolving it.',
						impact: { kind: 'write', operationId: null }
					},
					row
				);
				continue;
			}
			const imported = legacyNoteImport(parsed.data.record);
			if (imported) imports.push(imported);
		}
		return imports;
	} finally {
		database.close();
	}
};

export const migrateLegacyNotes = async (
	accountId: string,
	outbox: Pick<IndexedDbOutbox<WorkspaceCommand, WorkspaceRecord>, 'importOnce'>,
	databaseName = 'followthrough-note-sync'
): Promise<void> => {
	const imports = await readLegacyNoteImports(accountId, databaseName);
	for (const imported of imports) {
		const result = await outbox.importOnce(
			accountId,
			imported.source,
			imported.draft,
			imported.conflict
		);
		if (result.kind === 'failure') console.warn(result.message);
	}
};
