import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export interface PostgresDatabaseContext {
	/** Connection string, for handing the same database to another process. */
	readonly url: string;
	readonly client: ReturnType<typeof postgres>;
	readonly db: ReturnType<typeof drizzle<typeof schema>>;
	close(): Promise<void>;
}

export function connectPostgresTestDatabase(url: string): PostgresDatabaseContext {
	const client = postgres(url, { max: 1 });
	return {
		url,
		client,
		db: drizzle(client, { schema }),
		async close() {
			await client.end();
		}
	};
}
