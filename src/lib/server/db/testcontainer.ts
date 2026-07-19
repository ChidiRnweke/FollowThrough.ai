import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import * as schema from './schema';
import { fileURLToPath } from 'node:url';

export interface PostgresTestContext {
	readonly container: StartedTestContainer;
	/** Connection string, for handing the same database to another process. */
	readonly url: string;
	readonly client: ReturnType<typeof postgres>;
	readonly db: ReturnType<typeof drizzle<typeof schema>>;
	stop(): Promise<void>;
}

export async function startPostgresTestcontainer(): Promise<PostgresTestContext> {
	const container = await new GenericContainer('pgvector/pgvector:pg17')
		.withEnvironment({
			POSTGRES_DB: 'followthrough_test',
			POSTGRES_USER: 'test',
			POSTGRES_PASSWORD: 'test'
		})
		.withExposedPorts(5432)
		// The image starts a temporary init server before the final database.
		// Waiting for the second readiness line avoids racing migrations against shutdown/startup.
		.withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
		.start();
	const url = `postgres://test:test@${container.getHost()}:${container.getMappedPort(5432)}/followthrough_test`;
	const client = postgres(url, { max: 1 });
	const db = drizzle(client, { schema });
	await migrate(db, {
		migrationsFolder: fileURLToPath(new URL('../../../../drizzle', import.meta.url))
	});
	return {
		container,
		url,
		client,
		db,
		async stop() {
			await client.end();
			await container.stop();
		}
	};
}
