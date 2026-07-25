/* eslint-disable @typescript-eslint/ban-ts-comment -- imported runtime JavaScript exposes inferred internals. */
// @ts-nocheck -- exercises dependency-injected JavaScript process entrypoints.
import { describe, expect, test } from 'vitest';
import {
	buildDatabaseUrl,
	provisionDatabase,
	quoteIdentifier,
	quoteLiteral,
	resolveDatabaseIdentity
} from '../../../scripts/provision-db.js';

const environment = {
	INFISICAL_URL: 'https://infisical.example',
	INFISICAL_PROJECT_ID: 'app-project',
	INFISICAL_ADMIN_PROJECT_ID: 'admin-project',
	INFISICAL_ENVIRONMENT: 'prod',
	INFISICAL_CLIENT_ID: 'app-client',
	INFISICAL_CLIENT_SECRET: 'app-secret',
	INFISICAL_ADMIN_CLIENT_ID: 'admin-client',
	INFISICAL_ADMIN_CLIENT_SECRET: 'admin-secret'
};

class FakeSecretClient {
	values: Record<string, string>;
	error: Error | undefined;

	constructor(values: Record<string, string> = {}) {
		this.values = values;
	}

	auth() {
		return { universalAuth: { login: async () => undefined } };
	}

	secrets() {
		return {
			listSecrets: async () => {
				if (this.error) throw this.error;
				return {
					secrets: Object.entries(this.values).map(([secretKey, secretValue]) => ({
						secretKey,
						secretValue
					}))
				};
			},
			updateSecret: async () => undefined,
			createSecret: async () => undefined
		};
	}
}

const adminSecrets = () => ({
	POSTGRES_ADMIN_USER: 'admin',
	POSTGRES_ADMIN_PASSWORD: 'admin-password',
	POSTGRES_HOST: 'db.example',
	POSTGRES_PORT: '5432'
});

/** Records every connection and statement a provisioning run issues against PostgreSQL. */
function recordingPostgres({
	probeResult = [],
	failOn
}: { probeResult?: unknown[]; failOn?: RegExp } = {}) {
	const statements: Array<{ query: string; params: unknown }> = [];
	const connections: string[] = [];
	const client = (connectionString: string) => {
		connections.push(connectionString);
		const sql = async () => probeResult;
		sql.unsafe = async (query: string, params?: unknown) => {
			statements.push({ query, params });
			if (failOn?.test(query)) throw new Error('insufficient privilege');
			return [];
		};
		sql.end = async () => undefined;
		return sql;
	};
	return { client, statements, connections };
}

const indexOf = (statements: Array<{ query: string }>, prefix: string) =>
	statements.findIndex(({ query }) => query.startsWith(prefix));

const provisionFresh = async (passwordFactory = () => 'generated-password') => {
	const postgres = recordingPostgres();
	await provisionDatabase({
		environment,
		appClient: new FakeSecretClient(),
		adminClient: new FakeSecretClient(adminSecrets()),
		postgresClient: postgres.client,
		passwordFactory
	});
	return postgres.statements;
};

describe('database provisioning invariants', () => {
	test('existing database URL returns without opening PostgreSQL', async () => {
		const appClient = new FakeSecretClient({ DATABASE_URL: 'postgresql://existing' });
		const result = await provisionDatabase({
			environment,
			appClient,
			adminClient: new FakeSecretClient(),
			postgresClient: () => {
				throw new Error('must not connect');
			}
		});
		expect(result.created).toBe(false);
	});

	test('connection URL encodes credentials and database name', () => {
		expect(
			buildDatabaseUrl({
				user: 'user@x',
				password: 'p:/?',
				host: 'db',
				port: '5432',
				database: 'my db'
			})
		).toBe('postgresql://user%40x:p%3A%2F%3F@db:5432/my%20db');
	});

	test('database identity uses application defaults when Infisical values are absent', () => {
		expect(resolveDatabaseIdentity({})).toEqual({
			dbName: 'followthrough',
			dbUser: 'followthrough'
		});
	});

	test('SQL identifiers double embedded quotes', () => {
		expect(quoteIdentifier('role"name')).toBe('"role""name"');
	});

	test('SQL literals double embedded quotes', () => {
		expect(quoteLiteral("pass'word")).toBe("'pass''word'");
	});

	test('role creation inlines the password as a quoted literal', async () => {
		const statements = await provisionFresh();
		expect(statements.find(({ query }) => query.startsWith('CREATE ROLE'))?.query).toBe(
			`CREATE ROLE "followthrough" WITH LOGIN PASSWORD 'generated-password'`
		);
	});

	test('password rotation inlines the password as a quoted literal', async () => {
		// A non-empty probe result marks the database and role as already present.
		const postgres = recordingPostgres({ probeResult: [{ exists: 1 }] });
		await provisionDatabase({
			environment,
			appClient: new FakeSecretClient(),
			adminClient: new FakeSecretClient(adminSecrets()),
			postgresClient: postgres.client,
			passwordFactory: () => 'rotated-password'
		});
		expect(postgres.statements.find(({ query }) => query.startsWith('ALTER ROLE'))?.query).toBe(
			`ALTER ROLE "followthrough" WITH LOGIN PASSWORD 'rotated-password'`
		);
	});

	test('the admin is granted role membership before the database owner changes', async () => {
		const statements = await provisionFresh();
		expect(indexOf(statements, 'GRANT "followthrough" TO CURRENT_USER')).toBeLessThan(
			indexOf(statements, 'ALTER DATABASE')
		);
	});

	test('schema privileges are granted over a connection as the provisioned role', async () => {
		const postgres = recordingPostgres();
		await provisionDatabase({
			environment,
			appClient: new FakeSecretClient(),
			adminClient: new FakeSecretClient(adminSecrets()),
			postgresClient: postgres.client,
			passwordFactory: () => 'generated-password'
		});
		expect(postgres.connections.at(-1)).toBe(
			'postgresql://followthrough:generated-password@db.example:5432/followthrough'
		);
	});

	test('a refused membership grant does not abort provisioning', async () => {
		const postgres = recordingPostgres({ failOn: /^GRANT "followthrough" TO CURRENT_USER/ });
		const result = await provisionDatabase({
			environment,
			appClient: new FakeSecretClient(),
			adminClient: new FakeSecretClient(adminSecrets()),
			postgresClient: postgres.client
		});
		expect(result.created).toBe(true);
	});

	test('no statement uses bind parameters, which PostgreSQL rejects in utility commands', async () => {
		const statements = await provisionFresh();
		expect(statements.every(({ params }) => params === undefined)).toBe(true);
	});

	test('non-missing Infisical errors fail closed', async () => {
		const appClient = new FakeSecretClient();
		appClient.error = Object.assign(new Error('forbidden'), { statusCode: 403 });
		await expect(
			provisionDatabase({ environment, appClient, adminClient: new FakeSecretClient() })
		).rejects.toThrow('forbidden');
	});
});
