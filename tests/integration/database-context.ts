import type { PostgresDatabaseContext } from '$lib/server/db/postgres-test-context';

let activeContext: PostgresDatabaseContext | undefined;

const requireContext = (): PostgresDatabaseContext => {
	if (!activeContext) throw new Error('The PostgreSQL contract context is not active');
	return activeContext;
};

export const context: PostgresDatabaseContext = {
	get url() {
		return requireContext().url;
	},
	get client() {
		return requireContext().client;
	},
	get db() {
		return requireContext().db;
	},
	close() {
		return requireContext().close();
	}
};

export const setDatabaseContext = (database: PostgresDatabaseContext): void => {
	activeContext = database;
};

export const clearDatabaseContext = (): void => {
	activeContext = undefined;
};
