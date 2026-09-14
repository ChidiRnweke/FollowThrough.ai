import { Dexie } from 'dexie';
import { accountDatabaseName } from './database';

/** Recovery opens raw account storage independently of model parsing or workspace startup. */
export class IndexedDbStorageRecovery {
	constructor(private readonly prefix = 'followthrough-workspace-sync') {}
	async downloadAccount(accountId: string): Promise<Blob> {
		const database = new Dexie(accountDatabaseName(accountId, this.prefix), { autoOpen: false });
		try {
			await database.open();
			const { exportDB } = await import('dexie-export-import');
			return await exportDB(database);
		} finally {
			database.close({ disableAutoOpen: true });
		}
	}
	async resetAccount(accountId: string): Promise<void> {
		const database = new Dexie(accountDatabaseName(accountId, this.prefix), { autoOpen: false });
		await new Promise<void>((resolve, reject) => {
			database.on('blocked', () =>
				reject(new Error('Close other app tabs to finish resetting this account, then retry.'))
			);
			void database.delete().then(() => resolve(), reject);
		});
	}
}
