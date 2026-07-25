import { describe, expect, test } from 'vitest';
import {
	APPLICATION_DEFAULTS,
	EnvSecretsBackend,
	InfisicalSecretsBackend,
	SecretsNotFoundError,
	SecretsReader,
	hydrateEnvironment,
	mergePlatformEnvironment
} from './secrets';

class FakeSecretsClient {
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
		now
	);

const applicationSecrets = () => ({
	DATABASE_URL: 'postgresql://app',
	OPENROUTER_API_KEY: 'router-key'
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
		expect(await backend.readSecret('DATABASE_URL')).toBe('postgresql://app');
	});

	test('an exhausted retry budget surfaces as not found', async () => {
		const client = new FakeSecretsClient(applicationSecrets());
		client.failures = 3;
		const backend = infisicalBackend(client);
		await expect(backend.readSecret('DATABASE_URL')).rejects.toThrow(SecretsNotFoundError);
	});

	test('a retry re-authenticates in case the access token expired', async () => {
		const client = new FakeSecretsClient(applicationSecrets());
		client.failures = 1;
		await infisicalBackend(client).readSecret('DATABASE_URL');
		expect(client.logins).toBe(1);
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
});

describe('environment hydration', () => {
	test('secret values are published onto the environment', async () => {
		const environment: Record<string, string | undefined> = {};
		const client = new FakeSecretsClient(applicationSecrets());
		await hydrateEnvironment({ environment, reader: new SecretsReader(infisicalBackend(client)) });
		expect(environment.DATABASE_URL).toBe('postgresql://app');
	});

	test('application defaults fill in absent secrets', async () => {
		const environment: Record<string, string | undefined> = {};
		const client = new FakeSecretsClient(applicationSecrets());
		await hydrateEnvironment({ environment, reader: new SecretsReader(infisicalBackend(client)) });
		expect(environment.S3_BUCKET).toBe(APPLICATION_DEFAULTS.S3_BUCKET);
	});

	test('a missing required secret fails hard', async () => {
		const client = new FakeSecretsClient({ OPENROUTER_API_KEY: 'router-key' });
		await expect(
			hydrateEnvironment({ environment: {}, reader: new SecretsReader(infisicalBackend(client)) })
		).rejects.toThrow('DATABASE_URL');
	});

	test('platform keys already on the environment survive hydration', async () => {
		const environment: Record<string, string | undefined> = {
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4317',
			...applicationSecrets()
		};
		const client = new FakeSecretsClient(applicationSecrets());
		await hydrateEnvironment({ environment, reader: new SecretsReader(infisicalBackend(client)) });
		expect(environment.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://collector:4317');
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
	test('platform keys are copied from the file environment', () => {
		expect(
			mergePlatformEnvironment({}, { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4317' })
		).toEqual({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4317' });
	});

	test('application keys are left to the secrets backend', () => {
		expect(mergePlatformEnvironment({}, { DATABASE_URL: 'postgresql://file' })).toEqual({});
	});

	test('an existing platform value is not overwritten', () => {
		expect(
			mergePlatformEnvironment({ INFISICAL_URL: 'https://set' }, { INFISICAL_URL: 'https://file' })
		).toEqual({ INFISICAL_URL: 'https://set' });
	});
});
