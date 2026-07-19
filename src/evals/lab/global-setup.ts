import type { TestProject } from 'vitest/node';
import { startPostgresTestcontainer } from '$lib/server/db/testcontainer';

/**
 * One migrated pgvector container for the whole eval run. Cases isolate by
 * owning a distinct actor rather than by truncating, so they can share it.
 *
 * Only the connection string crosses into the test workers — the drizzle handle
 * itself cannot, because global setup runs in its own process.
 */
export default async function setup(project: TestProject) {
	const context = await startPostgresTestcontainer();
	project.provide('databaseUrl', context.url);
	return async () => {
		await context.stop();
	};
}

declare module 'vitest' {
	interface ProvidedContext {
		databaseUrl: string;
	}
}
