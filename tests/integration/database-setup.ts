import { afterAll, beforeAll, inject } from 'vitest';
import {
	connectPostgresTestDatabase,
	type PostgresDatabaseContext
} from '$lib/server/db/postgres-test-context';
import { clearDatabaseContext, setDatabaseContext } from './database-context';

let context: PostgresDatabaseContext | undefined;

beforeAll(() => {
	context = connectPostgresTestDatabase(inject('postgresUrl'));
	setDatabaseContext(context);
});

afterAll(async () => {
	if (!context) throw new Error('The PostgreSQL contract context was not created');
	await context.close();
	clearDatabaseContext();
});
