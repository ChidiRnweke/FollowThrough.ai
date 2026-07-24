/* eslint-disable @typescript-eslint/ban-ts-comment -- Node executes this JavaScript entrypoint directly. */
// @ts-nocheck -- behaviour and dependency contracts are covered by Vitest fakes.
import { config as loadDotenv } from 'dotenv';

export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const BOOTSTRAP_KEYS = [
	'INFISICAL_CLIENT_ID',
	'INFISICAL_CLIENT_SECRET',
	'INFISICAL_PROJECT_ID',
	'INFISICAL_ENVIRONMENT',
	'INFISICAL_URL'
];

export const REQUIRED_APPLICATION_KEYS = ['DATABASE_URL', 'OPENROUTER_API_KEY'];

export const APPLICATION_DEFAULTS = Object.freeze({
	DB_NAME: 'followthrough',
	DB_USER: 'followthrough',
	LOCAL_USER_ID: '00000000-0000-4000-8000-000000000001',
	ORIGIN: 'http://localhost:5173',
	BODY_SIZE_LIMIT: '52428800',
	OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
	OPENROUTER_DEFAULT_MODEL: 'openai/gpt-5.6',
	OPENROUTER_RECOMMENDED_MODELS: 'openai/gpt-5.6,anthropic/claude-sonnet-4.5',
	OPENROUTER_INLINE_MODEL: 'deepseek/deepseek-v4-flash',
	OPENROUTER_ATTACHMENT_VISION_MODEL: 'google/gemini-2.5-flash-lite',
	RETRIEVAL_CHUNK_TOKENS: '2400',
	RETRIEVAL_CHUNK_OVERLAP_TOKENS: '480',
	ATTACHMENT_MAX_BYTES: '52428800',
	ATTACHMENT_PARSE_MAX_BYTES: '52428800',
	S3_ENDPOINT: 'http://localhost:9000',
	S3_REGION: 'us-east-1',
	S3_ACCESS_KEY_ID: 'followthrough',
	S3_SECRET_ACCESS_KEY: 'followthrough-local-secret',
	S3_BUCKET: 'followthrough-attachments',
	S3_FORCE_PATH_STYLE: 'true',
	AUTHENTIK_DOMAIN: '',
	AUTHENTIK_CLIENT_ID: '',
	AUTHENTIK_CLIENT_SECRET: '',
	AUTHENTIK_CALLBACK_URL: 'http://localhost:5173/auth/callback',
	EVAL_RECORD: '0',
	EVAL_STRICT_CACHE: '0',
	EVAL_MODEL: 'deepseek/deepseek-v4-pro',
	EVAL_JUDGE_MODEL: 'deepseek/deepseek-v4-pro',
	EVAL_GATE: '0'
});

export const APPLICATION_KEYS = [
	...REQUIRED_APPLICATION_KEYS,
	...Object.keys(APPLICATION_DEFAULTS)
];

const PLATFORM_KEYS = new Set(['CONFIG_SOURCE', 'NODE_ENV', 'CI', 'GIT_COMMIT', ...BOOTSTRAP_KEYS]);

const isPlatformKey = (key) =>
	PLATFORM_KEYS.has(key) || key.startsWith('OTEL_') || key.startsWith('PHOENIX_');

export function mergePlatformEnvironment(environment, fileEnvironment) {
	for (const [key, value] of Object.entries(fileEnvironment)) {
		if (isPlatformKey(key) && environment[key] === undefined) environment[key] = value;
	}
	return environment;
}

function requireValues(environment, keys, label) {
	const missing = keys.filter((key) => !environment[key]?.trim());
	if (missing.length > 0)
		throw new Error(
			`${label} is missing required variable${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`
		);
}

export function validateBootstrap(environment) {
	requireValues(environment, BOOTSTRAP_KEYS, 'Infisical bootstrap configuration');
}

export function validateApplicationSecrets(secrets, source = 'Application configuration') {
	requireValues(secrets, REQUIRED_APPLICATION_KEYS, source);
}

export function resolveApplicationConfig(values, source = 'Application configuration') {
	const configuredValues = Object.fromEntries(
		Object.entries(values).filter(([, value]) => typeof value === 'string' && value.trim())
	);
	const snapshot = Object.freeze({ ...APPLICATION_DEFAULTS, ...configuredValues });
	validateApplicationSecrets(snapshot, source);
	return snapshot;
}

export function secretsToSnapshot(response) {
	const secrets = Array.isArray(response) ? response : response?.secrets;
	if (!Array.isArray(secrets))
		throw new Error('Infisical returned an invalid secret-list response');
	return Object.freeze(
		Object.fromEntries(
			secrets
				.filter(
					(secret) =>
						typeof secret?.secretKey === 'string' && typeof secret?.secretValue === 'string'
				)
				.filter((secret) => !isPlatformKey(secret.secretKey))
				.map((secret) => [secret.secretKey, secret.secretValue])
		)
	);
}

async function createInfisicalClient(siteUrl) {
	const { InfisicalSDK } = await import('@infisical/sdk');
	return new InfisicalSDK({ siteUrl });
}

export class ConfigService {
	#client;
	#environment;
	#scheduler;
	#snapshot = Object.freeze({});
	#refreshTimer;

	constructor({ environment = process.env, client, scheduler = globalThis } = {}) {
		this.#environment = environment;
		this.#client = client;
		this.#scheduler = scheduler;
	}

	get snapshot() {
		return this.#snapshot;
	}

	async initialize() {
		const source = this.#environment.CONFIG_SOURCE ?? 'infisical';
		if (source === 'env') {
			loadDotenv({ processEnv: this.#environment, quiet: true });
			const snapshot = resolveApplicationConfig(
				Object.fromEntries(APPLICATION_KEYS.map((key) => [key, this.#environment[key]])),
				'Environment'
			);
			for (const [key, value] of Object.entries(snapshot)) this.#environment[key] = value;
			this.#snapshot = snapshot;
			return snapshot;
		}
		if (source !== 'infisical')
			throw new Error('CONFIG_SOURCE must be either "infisical" or "env"');

		validateBootstrap(this.#environment);
		this.#client ??= await createInfisicalClient(this.#environment.INFISICAL_URL);
		await this.#client.auth().universalAuth.login({
			clientId: this.#environment.INFISICAL_CLIENT_ID,
			clientSecret: this.#environment.INFISICAL_CLIENT_SECRET
		});
		await this.refresh();
		this.#refreshTimer = this.#scheduler.setInterval(
			() => void this.refresh().catch(() => {}),
			REFRESH_INTERVAL_MS
		);
		this.#refreshTimer?.unref?.();
		return this.#snapshot;
	}

	async refresh() {
		const response = await this.#client.secrets().listSecrets({
			projectId: this.#environment.INFISICAL_PROJECT_ID,
			environment: this.#environment.INFISICAL_ENVIRONMENT,
			secretPath: '/',
			expandSecretReferences: true,
			includeImports: false,
			recursive: false,
			viewSecretValue: true
		});
		const nextSnapshot = resolveApplicationConfig(secretsToSnapshot(response), 'Infisical');
		for (const key of Object.keys(this.#snapshot)) {
			if (!(key in nextSnapshot)) delete this.#environment[key];
		}
		for (const [key, value] of Object.entries(nextSnapshot)) this.#environment[key] = value;
		this.#snapshot = nextSnapshot;
		return nextSnapshot;
	}

	stop() {
		if (this.#refreshTimer !== undefined) this.#scheduler.clearInterval(this.#refreshTimer);
		this.#refreshTimer = undefined;
	}
}

export async function initializeConfig(options) {
	const service = new ConfigService(options);
	await service.initialize();
	return service;
}
