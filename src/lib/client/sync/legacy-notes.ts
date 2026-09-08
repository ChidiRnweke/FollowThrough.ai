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
	databaseName = 'followthrough-note-sync'
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
		const rows = z
			.array(
				z
					.object({ key: z.string(), record: legacyNoteSyncRecordSchema })
					.refine(
						(row) =>
							row.record.userId === accountId && row.key === `${accountId}:${row.record.noteId}`,
						'A saved draft has an inconsistent account key'
					)
			)
			.parse(stored);
		return rows.flatMap(({ record }) => {
			const imported = legacyNoteImport(record);
			return imported ? [imported] : [];
		});
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
	for (const imported of imports)
		await outbox.importOnce(accountId, imported.source, imported.draft, imported.conflict);
};
