import type { LegacyNoteSyncRecord } from '$lib/models/workspace-mutations';
import { completed, requestValue } from '$lib/client/sync/database';
export const seedLegacyNoteStorage = async (
	name: string,
	records: readonly LegacyNoteSyncRecord[]
): Promise<void> => {
	const request = indexedDB.open(name, 2);
	request.onupgradeneeded = () =>
		request.result.createObjectStore('note-sync-records', { keyPath: 'key' });
	const database = await requestValue(request);
	try {
		const transaction = database.transaction('note-sync-records', 'readwrite');
		const done = completed(transaction);
		for (const record of records)
			transaction
				.objectStore('note-sync-records')
				.put({ key: `${record.userId}:${record.noteId}`, record });
		await done;
	} finally {
		database.close();
	}
};
