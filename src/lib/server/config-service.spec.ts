/* eslint-disable @typescript-eslint/ban-ts-comment -- imported runtime JavaScript exposes inferred internals. */
// @ts-nocheck -- exercises dependency-injected JavaScript process entrypoints.
import { describe, expect, test } from 'vitest';
import {
	APPLICATION_DEFAULTS,
	ConfigService,
	REFRESH_INTERVAL_MS,
	REQUIRED_APPLICATION_KEYS,
	mergePlatformEnvironment,
	resolveApplicationConfig,
	secretsToSnapshot,
	validateBootstrap
} from '../../../scripts/config-service.js';

const validSecrets = (suffix = '') =>
	REQUIRED_APPLICATION_KEYS.map((secretKey) => ({
		secretKey,
		secretValue: `${secretKey}-value${suffix}`
	}));

const bootstrap = () => ({
	INFISICAL_CLIENT_ID: 'client',
	INFISICAL_CLIENT_SECRET: 'secret',
	INFISICAL_PROJECT_ID: 'project',
	INFISICAL_ENVIRONMENT: 'prod',
	INFISICAL_URL: 'https://infisical.example'
});

class FakeInfisicalClient {
	responses: Array<unknown> = [{ secrets: validSecrets() }];
	listOptions: unknown;
	loginOptions: unknown;

	auth() {
		return { universalAuth: { login: async (options: unknown) => (this.loginOptions = options) } };
	}

	secrets() {
		return {
			listSecrets: async (options: unknown) => {
				this.listOptions = options;
				const response = this.responses.shift();
				if (response instanceof Error) throw response;
				return response;
			}
		};
	}
}

class FakeScheduler {
	delay = 0;
	callback: (() => void) | undefined;

	setInterval(callback: () => void, delay: number) {
		this.callback = callback;
		this.delay = delay;
		return 1;
	}

	clearInterval() {}
}

describe('managed configuration invariants', () => {
	test('local files expose only platform configuration in Infisical mode', () => {
		const environment: Record<string, string> = {};
		mergePlatformEnvironment(environment, {
			CONFIG_SOURCE: 'infisical',
			INFISICAL_CLIENT_ID: 'client',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
			DATABASE_URL: 'must-not-leak'
		});
		expect(environment).toEqual({
			CONFIG_SOURCE: 'infisical',
			INFISICAL_CLIENT_ID: 'client',
			OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318'
		});
	});

	test('process platform configuration takes precedence over local files', () => {
		const environment = { INFISICAL_ENVIRONMENT: 'production' };
		mergePlatformEnvironment(environment, { INFISICAL_ENVIRONMENT: 'development' });
		expect(environment.INFISICAL_ENVIRONMENT).toBe('production');
	});

	test('defaults to Infisical configuration', async () => {
		const client = new FakeInfisicalClient();
		await new ConfigService({ environment: bootstrap(), client }).initialize();
		expect(client.loginOptions).toEqual({ clientId: 'client', clientSecret: 'secret' });
	});

	test('env mode does not authenticate with Infisical', async () => {
		const client = new FakeInfisicalClient();
		const environment = Object.fromEntries(
			validSecrets().map(({ secretKey, secretValue }) => [secretKey, secretValue])
		);
		await new ConfigService({
			environment: { ...environment, CONFIG_SOURCE: 'env' },
			client
		}).initialize();
		expect(client.loginOptions).toBeUndefined();
	});

	test('bootstrap validation reports absent values', () => {
		expect(() => validateBootstrap({})).toThrow('INFISICAL_CLIENT_ID');
	});

	test('initial fetch failure rejects startup', async () => {
		const client = new FakeInfisicalClient();
		client.responses = [new Error('unavailable')];
		await expect(
			new ConfigService({ environment: bootstrap(), client }).initialize()
		).rejects.toThrow('unavailable');
	});

	test('missing required Infisical variable identifies its name', async () => {
		const client = new FakeInfisicalClient();
		client.responses = [
			{
				secrets: validSecrets().filter(({ secretKey }) => secretKey !== 'DATABASE_URL')
			}
		];
		await expect(
			new ConfigService({ environment: bootstrap(), client }).initialize()
		).rejects.toThrow('Infisical is missing required variable: DATABASE_URL');
	});

	test('missing Infisical setting uses its application default', () => {
		const snapshot = resolveApplicationConfig(
			Object.fromEntries(
				validSecrets().map(({ secretKey, secretValue }) => [secretKey, secretValue])
			),
			'Infisical'
		);
		expect(snapshot.S3_ENDPOINT).toBe(APPLICATION_DEFAULTS.S3_ENDPOINT);
	});

	test('blank Infisical setting uses its application default', () => {
		const snapshot = resolveApplicationConfig(
			{
				...Object.fromEntries(
					validSecrets().map(({ secretKey, secretValue }) => [secretKey, secretValue])
				),
				S3_ENDPOINT: ''
			},
			'Infisical'
		);
		expect(snapshot.S3_ENDPOINT).toBe(APPLICATION_DEFAULTS.S3_ENDPOINT);
	});

	test('Infisical setting overrides its application default', () => {
		const snapshot = resolveApplicationConfig(
			{
				...Object.fromEntries(
					validSecrets().map(({ secretKey, secretValue }) => [secretKey, secretValue])
				),
				S3_ENDPOINT: 'https://objects.example'
			},
			'Infisical'
		);
		expect(snapshot.S3_ENDPOINT).toBe('https://objects.example');
	});

	test('loads only root secrets without imports', async () => {
		const client = new FakeInfisicalClient();
		await new ConfigService({ environment: bootstrap(), client }).initialize();
		expect(client.listOptions).toMatchObject({
			secretPath: '/',
			includeImports: false,
			expandSecretReferences: true
		});
	});

	test('schedules refresh every five minutes', async () => {
		const scheduler = new FakeScheduler();
		await new ConfigService({
			environment: bootstrap(),
			client: new FakeInfisicalClient(),
			scheduler
		}).initialize();
		expect(scheduler.delay).toBe(REFRESH_INTERVAL_MS);
	});

	test('refresh atomically replaces the published snapshot', async () => {
		const client = new FakeInfisicalClient();
		client.responses = [{ secrets: validSecrets() }, { secrets: validSecrets('-new') }];
		const service = new ConfigService({ environment: bootstrap(), client });
		await service.initialize();
		const first = service.snapshot;
		await service.refresh();
		expect(service.snapshot).not.toBe(first);
	});

	test('failed refresh preserves the last valid snapshot', async () => {
		const client = new FakeInfisicalClient();
		client.responses = [{ secrets: validSecrets() }, new Error('refresh failed')];
		const service = new ConfigService({ environment: bootstrap(), client });
		await service.initialize();
		const first = service.snapshot;
		await service.refresh().catch(() => undefined);
		expect(service.snapshot).toBe(first);
	});

	test('managed secrets cannot overwrite telemetry values', () => {
		const snapshot = secretsToSnapshot({
			secrets: [...validSecrets(), { secretKey: 'OTEL_EXPORTER_OTLP_ENDPOINT', secretValue: 'bad' }]
		});
		expect(snapshot.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
	});

	test('managed secrets cannot overwrite bootstrap values', () => {
		const snapshot = secretsToSnapshot({
			secrets: [...validSecrets(), { secretKey: 'INFISICAL_CLIENT_SECRET', secretValue: 'bad' }]
		});
		expect(snapshot.INFISICAL_CLIENT_SECRET).toBeUndefined();
	});
});
