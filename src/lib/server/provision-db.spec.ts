/* eslint-disable @typescript-eslint/ban-ts-comment -- imported runtime JavaScript exposes inferred internals. */
// @ts-nocheck -- exercises dependency-injected JavaScript process entrypoints.
import { describe, expect, test } from 'vitest';
import {
	buildDatabaseUrl,
	provisionDatabase,
	quoteIdentifier,
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

	test('non-missing Infisical errors fail closed', async () => {
		const appClient = new FakeSecretClient();
		appClient.error = Object.assign(new Error('forbidden'), { statusCode: 403 });
		await expect(
			provisionDatabase({ environment, appClient, adminClient: new FakeSecretClient() })
		).rejects.toThrow('forbidden');
	});
});
