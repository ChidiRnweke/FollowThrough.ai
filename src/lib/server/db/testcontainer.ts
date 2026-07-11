import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import * as schema from './schema';

export interface PostgresTestContext {
	readonly container: StartedTestContainer;
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
		.withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
		.start();
	const url = `postgres://test:test@${container.getHost()}:${container.getMappedPort(5432)}/followthrough_test`;
	const client = postgres(url, { max: 1 });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: 'drizzle' });
	return {
		container,
		client,
		db,
		async stop() {
			await client.end();
			await container.stop();
		}
	};
}
