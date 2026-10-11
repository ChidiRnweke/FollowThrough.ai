import { describe, expect, test } from 'vitest';
import {
	APPLICATION_DEFAULTS,
	EnvSecretsBackend,
	InfisicalSecretsBackend,
	type InfisicalLikeClient,
	SecretsBackendError,
	SecretsNotFoundError,
	SecretsReader,
	hydrateEnvironment,
	mergePlatformEnvironment
} from './config';

class FakeSecretsClient implements InfisicalLikeClient {
	calls = 0;
	failures = 0;
	logins = 0;
	values: Record<string, string>;

	constructor(values: Record<string, string> = {}) {
		this.values = values;
	}

	auth() {
		return {
			universalAuth: {
				login: async () => {
					this.logins += 1;
				}
			}
		};
	}

	secrets() {
		return {
			listSecrets: async () => {
				this.calls += 1;
				if (this.failures > 0) {
					this.failures -= 1;
					throw new Error('infisical unavailable');
				}
				return {
					secrets: Object.entries(this.values).map(([secretKey, secretValue]) => ({
						secretKey,
						secretValue
					}))
				};
			}
		};
	}
}

/** Answers with exactly the body it was handed, so the read boundary sees real wire shapes. */
class ShapedSecretsClient implements InfisicalLikeClient {
	constructor(private readonly body: unknown) {}

	auth() {
		return { universalAuth: { login: async () => undefined } };
	}

	secrets() {
		return { listSecrets: async () => this.body };
	}
}

const shapedBackend = (client: ShapedSecretsClient) =>
	new InfisicalSecretsBackend(
		client,
		'project',
		'prod',
		1800,
		async () => undefined,
		() => 0,
		async () => undefined
	);

const infisicalBackend = (
	client: FakeSecretsClient,
	{ ttl = 1800, now = () => 0 }: { ttl?: number; now?: () => number } = {}
) =>
	new InfisicalSecretsBackend(
		client,
		'project',
		'prod',
		ttl,
		() => client.auth().universalAuth.login(),
		now,
		async () => undefined
	);

const applicationSecrets = () => ({
	DATABASE_URL: 'postgresql://app',
	OPENROUTER_API_KEY: 'router-key',
	MISTRAL_API_KEY: 'mistral-key',
	AUTHENTIK_DOMAIN: 'https://auth.example.test',
	AUTHENTIK_CLIENT_ID: 'test-client',
	AUTHENTIK_CLIENT_SECRET: 'test-secret',
	AUTHENTIK_CALLBACK_URL: 'https://app.example.test/auth/callback'
});

describe('secrets backends', () => {
	test('missing environment variable is reported as not found', async () => {
		const backend = new EnvSecretsBackend({});
		await expect(backend.readSecret('DATABASE_URL')).rejects.toThrow(SecretsNotFoundError);
	});

	test('environment fallback is used when the variable is absent', async () => {
		const backend = new EnvSecretsBackend({});
		expect(await backend.readOrDefault('S3_REGION', 'us-east-1')).toBe('us-east-1');
	});

	test('repeated reads inside the TTL window hit Infisical once', async () => {
		const client = new FakeSecretsClient(applicationSecrets());
		const backend = infisicalBackend(client);
		await backend.readSecret('DATABASE_URL');
		await backend.readSecret('OPENROUTER_API_KEY');
		expect(client.calls).toBe(1);
	});

	test('an expired cache entry is refetched', async () => {
		const client = new FakeSecretsClient(applicationSecrets());
		let clock = 0;
		const backend = infisicalBackend(client, { ttl: 60, now: () => clock });
		await backend.readSecret('DATABASE_URL');
		clock = 61;
		await backend.readSecret('DATABASE_URL');
		expect(client.calls).toBe(2);
	});

	test('concurrent reads share a single refresh', async () => {
		const client = new FakeSecretsClient(applicationSecrets());
		const backend = infisicalBackend(client);
		await Promise.all([backend.readSecret('DATABASE_URL'), backend.readSecret('DATABASE_URL')]);
		expect(client.calls).toBe(1);
	});

	test('a transient fetch failure is retried before giving up', async () => {
		const client = new FakeSecretsClient(applicationSecrets());
		client.failures = 1;
		const backend = infisicalBackend(client);
		const value = await backend.readSecret('DATABASE_URL');
		expect({ value, logins: client.logins }).toEqual({ value: 'postgresql://app', logins: 1 });
	});

	// This test used to require the opposite, and required a bug. `readOptional`
	// turns `SecretsNotFoundError` into `undefined` and every `readOrDefault` then
	// falls back — so an unreachable Infisical reported as "not found" would boot
	// the whole application on default configuration, against a dead secret store,
	// with nothing anywhere saying so. An outage is not an absent secret.
	test('an exhausted retry budget surfaces as a backend failure, not as absence', async () => {
		const client = new FakeSecretsClient(applicationSecrets());
		client.failures = 3;
		const backend = infisicalBackend(client);
		await expect(backend.readSecret('DATABASE_URL')).rejects.toThrow(SecretsBackendError);
	});

	// The consequence that makes the distinction worth keeping.
	test('an unreachable backend is never read as an unset optional secret', async () => {
		const client = new FakeSecretsClient(applicationSecrets());
		client.failures = 3;
		await expect(infisicalBackend(client).readOptional('DATABASE_URL')).rejects.toThrow(
			SecretsBackendError
		);
	});

	test('platform keys are never served from the secrets backend', async () => {
		const client = new FakeSecretsClient({
			...applicationSecrets(),
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://injected:4317'
		});
		expect(await infisicalBackend(client).readOptional('OTEL_EXPORTER_OTLP_ENDPOINT')).toBe(
			undefined
		);
	});

	test('a secret list answered as a bare array is read', async () => {
		const client = new ShapedSecretsClient([
			{ secretKey: 'DATABASE_URL', secretValue: 'pg://app' }
		]);
		expect(await shapedBackend(client).readSecret('DATABASE_URL')).toBe('pg://app');
	});

	// The predicate this replaced dropped such an entry, so a secret whose value
	// came back null reached the application as an unset variable — the same
	// silence a wrong project id produces, and indistinguishable from it.
	test('a secret whose value is not a string fails the fetch rather than vanishing', async () => {
		const client = new ShapedSecretsClient({
			secrets: [{ secretKey: 'DATABASE_URL', secretValue: null }]
		});
		await expect(shapedBackend(client).readSecret('DATABASE_URL')).rejects.toThrow(
			SecretsBackendError
		);
	});

	test('a response that is neither an array nor an envelope fails the fetch', async () => {
		const client = new ShapedSecretsClient({ error: 'forbidden' });
		await expect(shapedBackend(client).readSecret('DATABASE_URL')).rejects.toThrow(
			'invalid secret-list response'
		);
	});
});

describe('environment hydration', () => {
	describe.each(['env', 'infisical'] as const)('%s authentication configuration', (source) => {
		describe.each([undefined, '', '   '])('absent value %s', (value) => {
			test.each([
				'AUTHENTIK_DOMAIN',
				'AUTHENTIK_CLIENT_ID',
				'AUTHENTIK_CLIENT_SECRET',
				'AUTHENTIK_CALLBACK_URL'
			])('rejects %s instead of enabling anonymous access', async (key) => {
				const values: Record<string, string> = applicationSecrets();
				if (value === undefined) delete values[key];
				else values[key] = value;
				const backend =
					source === 'env'
						? new EnvSecretsBackend(values)
						: infisicalBackend(new FakeSecretsClient(values));
				await expect(
					hydrateEnvironment({ environment: {}, reader: new SecretsReader(backend) })
				).rejects.toThrow(key);
			});
		});
	});

	test('publishes secrets and defaults while preserving platform configuration', async () => {
		const environment: Record<string, string | undefined> = {
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4317'
		};
		const client = new FakeSecretsClient(applicationSecrets());
		await hydrateEnvironment({ environment, reader: new SecretsReader(infisicalBackend(client)) });
		expect({
			databaseUrl: environment.DATABASE_URL,
			s3Bucket: environment.S3_BUCKET,
			endpoint: environment.OTEL_EXPORTER_OTLP_ENDPOINT
		}).toEqual({
			databaseUrl: 'postgresql://app',
			s3Bucket: APPLICATION_DEFAULTS.S3_BUCKET,
			endpoint: 'http://collector:4317'
		});
	});

	test('a missing required secret fails hard', async () => {
		const client = new FakeSecretsClient({ OPENROUTER_API_KEY: 'router-key' });
		await expect(
			hydrateEnvironment({ environment: {}, reader: new SecretsReader(infisicalBackend(client)) })
		).rejects.toThrow('DATABASE_URL');
	});

	test('the env backend hydrates straight from the environment', async () => {
		const environment: Record<string, string | undefined> = applicationSecrets();
		await hydrateEnvironment({
			environment,
			reader: new SecretsReader(new EnvSecretsBackend(environment))
		});
		expect(environment.OPENROUTER_API_KEY).toBe('router-key');
	});
});

describe('platform environment merging', () => {
	// adapter-node has already read BODY_SIZE_LIMIT by the time hydration runs, so the only
	// way a configured value reaches it is through the process environment.
	// Log verbosity is deployment policy: dev .env files carry LOG_LEVEL, and the
	// secrets backend must never get a vote.
	test('file platform policy fills missing keys without replacing platform values or secrets', () => {
		expect(
			mergePlatformEnvironment(
				{ INFISICAL_URL: 'https://set' },
				{
					OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4317',
					BODY_SIZE_LIMIT: '52428800',
					LOG_LEVEL: 'debug',
					DATABASE_URL: 'postgresql://file',
					INFISICAL_URL: 'https://file'
				}
			)
		).toEqual({
			INFISICAL_URL: 'https://set',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4317',
			BODY_SIZE_LIMIT: '52428800',
			LOG_LEVEL: 'debug'
		});
	});
});
