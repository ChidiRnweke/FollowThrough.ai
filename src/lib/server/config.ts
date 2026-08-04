import { config as loadDotenv } from 'dotenv';
import OpenAI from 'openai';
import { z } from 'zod';
type UserId = string & { readonly __brand: 'UserId' };

export const DEFAULT_LANGUAGE_MODEL_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_GENERATION_MODEL = 'deepseek/deepseek-v4-flash';

/** Mistral Document AI, which serves OCR on its own API rather than through OpenRouter. */
export const DEFAULT_MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
export const DEFAULT_OCR_MODEL = 'mistral-ocr-latest';

export const positiveNumberFromEnvironment = (name: string): number | undefined => {
	const raw = process.env[name];
	if (raw === undefined) return undefined;
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
	return value;
};

export const optionalProperty = <K extends string, V>(key: K, value: V | undefined) =>
	(value === undefined ? {} : { [key]: value }) as { [P in K]?: V };

export const localActor = () => ({
	userId: z
		.string()
		.uuid()
		.parse(process.env.LOCAL_USER_ID ?? '00000000-0000-4000-8000-000000000001') as UserId
});

export const authenticationEnabled = (): boolean =>
	Boolean(process.env.AUTHENTIK_CLIENT_ID?.trim());

export const requestActor = (user?: { readonly id: UserId }) =>
	authenticationEnabled() && user ? { userId: user.id } : localActor();

export const authentikConfiguration = () => {
	const domain = process.env.AUTHENTIK_DOMAIN;
	const clientId = process.env.AUTHENTIK_CLIENT_ID;
	const clientSecret = process.env.AUTHENTIK_CLIENT_SECRET;
	const callbackUrl = process.env.AUTHENTIK_CALLBACK_URL;
	if (!domain || !clientId || !clientSecret || !callbackUrl)
		throw new Error(
			'Authentik OAuth not configured. Set AUTHENTIK_DOMAIN, AUTHENTIK_CLIENT_ID, AUTHENTIK_CLIENT_SECRET, AUTHENTIK_CALLBACK_URL.'
		);
	return { domain, clientId, clientSecret, callbackUrl };
};

export const requiredEnvironmentValue = (name: string): string => {
	const value = process.env[name];
	if (!value)
		throw new Error(
			`${name} is required. Refusing to start with its capability silently disabled.`
		);
	return value;
};

export interface LanguageModelClientOptions {
	readonly baseURL?: string;
	readonly appURL?: string;
}

export const createLanguageModelClient = (
	apiKey: string,
	options: LanguageModelClientOptions = {}
): OpenAI =>
	new OpenAI({
		apiKey,
		baseURL: options.baseURL ?? DEFAULT_LANGUAGE_MODEL_BASE_URL,
		defaultHeaders: {
			'HTTP-Referer': options.appURL ?? 'http://localhost:5173',
			'X-OpenRouter-Title': 'FollowThrough'
		}
	});

/** Cached secrets are considered fresh for this long before Infisical is consulted again. */
export const DEFAULT_SECRET_TTL_SECONDS = 30 * 60;

/**
 * Retry a transient Infisical fetch failure (e.g. a cold-start network race)
 * before giving up, so a boot-time hiccup doesn't get cached as "no secret"
 * for the lifetime of the process.
 */
const INFISICAL_FETCH_RETRIES = 3;
const INFISICAL_FETCH_BACKOFF_SECONDS = [0.5, 1, 2];

export class SecretsNotFoundError extends Error {}

export const REQUIRED_APPLICATION_KEYS = [
	'DATABASE_URL',
	'OPENROUTER_API_KEY',
	'MISTRAL_API_KEY'
] as const;

export const APPLICATION_DEFAULTS = Object.freeze({
	DB_NAME: 'followthrough',
	DB_USER: 'followthrough',
	LOCAL_USER_ID: '00000000-0000-4000-8000-000000000001',
	ORIGIN: 'http://localhost:5173',
	OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
	OPENROUTER_DEFAULT_MODEL: 'openai/gpt-5.6',
	OPENROUTER_RECOMMENDED_MODELS: 'openai/gpt-5.6,anthropic/claude-sonnet-4.5',
	OPENROUTER_INLINE_MODEL: 'deepseek/deepseek-v4-flash',
	/* Read by services that hydrate lazily. Without entries here they are never
	   pulled from the secrets backend, so a user who clears the matching per-user
	   setting would fall back to a hard-coded literal rather than to whatever
	   this deployment configured. OPENROUTER_INLINE_COMPLETION_MODEL is
	   deliberately absent: it is checked ahead of OPENROUTER_INLINE_MODEL, so
	   giving it a default here would make that one unreachable. */
	OPENROUTER_ATTACHMENT_VISION_MODEL: 'google/gemini-2.5-flash-lite',
	MISTRAL_BASE_URL: 'https://api.mistral.ai/v1',
	MISTRAL_OCR_MODEL: 'mistral-ocr-latest',
	ATTACHMENT_OCR_MAX_PAGES: '100',
	/* Exa rather than 'auto': auto resolves to the model's own native search, which
	   returns snippets from a handful of results. Exa retrieves page content, which is
	   what makes the difference between citing a headline and answering from the page.
	   Accepts auto | native | exa | firecrawl | parallel | perplexity. */
	OPENROUTER_WEB_SEARCH_ENGINE: 'exa',
	OPENROUTER_WEB_SEARCH_MAX_RESULTS: '20',
	OPENROUTER_WEB_SEARCH_MAX_TOTAL_RESULTS: '40',
	RETRIEVAL_CHUNK_TOKENS: '2400',
	RETRIEVAL_CHUNK_OVERLAP_TOKENS: '480',
	/* Attached context notes at or under this many tokens ride inside the user
	   message; larger ones are replaced by a pointer to the search_note tool. */
	CONTEXT_NOTE_TOKEN_LIMIT: '4000',
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

export const APPLICATION_KEYS: string[] = [
	...REQUIRED_APPLICATION_KEYS,
	...Object.keys(APPLICATION_DEFAULTS)
];

export const BOOTSTRAP_KEYS = [
	'INFISICAL_CLIENT_ID',
	'INFISICAL_CLIENT_SECRET',
	'INFISICAL_PROJECT_ID',
	'INFISICAL_ENVIRONMENT',
	'INFISICAL_URL'
] as const;

const PLATFORM_KEYS = new Set<string>([
	'CONFIG_SOURCE',
	'NODE_ENV',
	'CI',
	'GIT_COMMIT',
	/* adapter-node reads BODY_SIZE_LIMIT at module load, before hooks.server.ts can run
	   hydrateEnvironment(), so a hydrated value is always too late and the adapter keeps its
	   512K default. It has to be in the process environment before `node build` starts:
	   the Dockerfile sets it, docker-compose.prod.yml can override it. */
	'BODY_SIZE_LIMIT',
	/* Log verbosity is deployment policy (dev wants debug, prod wants info), never
	   an application secret. Read once by resolveLogLevel in services/telemetry. */
	'LOG_LEVEL',
	...BOOTSTRAP_KEYS
]);

/** Platform keys are supplied by the deployment, never by the secrets backend. */
const isPlatformKey = (key: string): boolean =>
	PLATFORM_KEYS.has(key) || key.startsWith('OTEL_') || key.startsWith('PHOENIX_');

export type Environment = Record<string, string | undefined>;

/** Copy platform-only keys from a .env file into the environment without overwriting it. */
export function mergePlatformEnvironment(
	environment: Environment,
	fileEnvironment: Record<string, string>
): Environment {
	for (const [key, value] of Object.entries(fileEnvironment)) {
		if (isPlatformKey(key) && environment[key] === undefined) environment[key] = value;
	}
	return environment;
}

export interface SecretsBackend {
	readSecret(secretName: string): Promise<string>;
	readOrDefault(secretName: string, fallback: string): Promise<string>;
	readOptional(secretName: string): Promise<string | undefined>;
}

export class EnvSecretsBackend implements SecretsBackend {
	constructor(private readonly environment: Environment = process.env) {}

	async readSecret(secretName: string): Promise<string> {
		const value = this.environment[secretName];
		if (value === undefined) throw new SecretsNotFoundError(`Missing env var: ${secretName}`);
		return value;
	}

	async readOrDefault(secretName: string, fallback: string): Promise<string> {
		return (await this.readOptional(secretName)) ?? fallback;
	}

	async readOptional(secretName: string): Promise<string | undefined> {
		return this.environment[secretName];
	}
}

/** Structural view of the Infisical SDK surface this module uses, so tests can supply a fake. */
export interface InfisicalLikeClient {
	auth(): {
		universalAuth: {
			login(options: { clientId: string; clientSecret: string }): Promise<unknown>;
		};
	};
	secrets(): {
		listSecrets(options: {
			projectId: string;
			environment: string;
			secretPath?: string;
			expandSecretReferences?: boolean;
			includeImports?: boolean;
			recursive?: boolean;
			viewSecretValue?: boolean;
		}): Promise<unknown>;
	};
}

const sleep = (seconds: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));

function snapshotFromResponse(response: unknown): Record<string, string> {
	const secrets = Array.isArray(response)
		? response
		: (response as { secrets?: unknown } | null)?.secrets;
	if (!Array.isArray(secrets))
		throw new Error('Infisical returned an invalid secret-list response');
	return Object.fromEntries(
		secrets
			.filter(
				(secret): secret is { secretKey: string; secretValue: string } =>
					typeof secret?.secretKey === 'string' && typeof secret?.secretValue === 'string'
			)
			.filter((secret) => !isPlatformKey(secret.secretKey))
			.map((secret) => [secret.secretKey, secret.secretValue])
	);
}

/**
 * Infisical backend with an in-memory TTL cache.
 *
 * The whole project is fetched in one `listSecrets` call and cached for `ttl`
 * seconds, so repeated reads (e.g. the per-request `hydrateEnvironment()`) never
 * hit the Infisical API more than once per TTL window.
 */
export class InfisicalSecretsBackend implements SecretsBackend {
	private snapshot: Record<string, string> = {};
	private expiresAt = 0;
	private inFlight: Promise<Record<string, string>> | undefined;

	constructor(
		private readonly client: InfisicalLikeClient,
		private readonly projectId: string,
		private readonly environment: string,
		private readonly ttl: number = DEFAULT_SECRET_TTL_SECONDS,
		private readonly login: () => Promise<unknown> = async () => undefined,
		private readonly now: () => number = () => Date.now() / 1000,
		private readonly wait: (seconds: number) => Promise<void> = sleep
	) {}

	async readSecret(secretName: string): Promise<string> {
		const snapshot = await this.currentSnapshot();
		const value = snapshot[secretName];
		if (value === undefined) throw new SecretsNotFoundError(`Secret ${secretName} not found`);
		return value;
	}

	async readOrDefault(secretName: string, fallback: string): Promise<string> {
		return (await this.readOptional(secretName)) ?? fallback;
	}

	async readOptional(secretName: string): Promise<string | undefined> {
		try {
			return await this.readSecret(secretName);
		} catch {
			return undefined;
		}
	}

	private async currentSnapshot(): Promise<Record<string, string>> {
		if (this.now() < this.expiresAt) return this.snapshot;
		// Concurrent requests share a single refresh instead of stampeding Infisical.
		this.inFlight ??= this.fetchSnapshot().finally(() => (this.inFlight = undefined));
		return this.inFlight;
	}

	private async fetchSnapshot(): Promise<Record<string, string>> {
		let lastError: unknown;
		for (let attempt = 0; attempt < INFISICAL_FETCH_RETRIES; attempt += 1) {
			try {
				const response = await this.client.secrets().listSecrets({
					projectId: this.projectId,
					environment: this.environment,
					secretPath: '/',
					expandSecretReferences: true,
					includeImports: false,
					recursive: false,
					viewSecretValue: true
				});
				this.snapshot = snapshotFromResponse(response);
				this.expiresAt = this.now() + this.ttl;
				return this.snapshot;
			} catch (error) {
				lastError = error;
				if (attempt === INFISICAL_FETCH_RETRIES - 1) break;
				console.warn(`[secrets] Infisical fetch failed (attempt ${attempt + 1}), retrying`);
				await this.wait(INFISICAL_FETCH_BACKOFF_SECONDS[attempt]);
				// The access token may simply have expired — re-authenticate before retrying.
				await this.login().catch(() => undefined);
			}
		}
		throw new SecretsNotFoundError(
			`Failed to fetch secrets from Infisical: ${lastError instanceof Error ? lastError.message : String(lastError)}`
		);
	}
}

export class SecretsReader implements SecretsBackend {
	constructor(readonly backend: SecretsBackend) {}

	readSecret(secretName: string): Promise<string> {
		return this.backend.readSecret(secretName);
	}

	readOrDefault(secretName: string, fallback: string): Promise<string> {
		return this.backend.readOrDefault(secretName, fallback);
	}

	readOptional(secretName: string): Promise<string | undefined> {
		return this.backend.readOptional(secretName);
	}

	static async fromEnv(environment: Environment = process.env): Promise<SecretsReader> {
		loadDotenv({ processEnv: environment as NodeJS.ProcessEnv, quiet: true });

		const source = environment.CONFIG_SOURCE ?? 'infisical';
		if (source === 'env') return new SecretsReader(new EnvSecretsBackend(environment));
		if (source !== 'infisical')
			throw new Error('CONFIG_SOURCE must be either "infisical" or "env"');

		const missing = BOOTSTRAP_KEYS.filter((key) => !environment[key]?.trim());
		if (missing.length > 0)
			throw new Error(
				`Infisical bootstrap configuration is missing required variable${
					missing.length === 1 ? '' : 's'
				}: ${missing.join(', ')}`
			);

		const { InfisicalSDK } = await import('@infisical/sdk');
		const client = new InfisicalSDK({ siteUrl: environment.INFISICAL_URL });
		const login = () =>
			client.auth().universalAuth.login({
				clientId: environment.INFISICAL_CLIENT_ID!,
				clientSecret: environment.INFISICAL_CLIENT_SECRET!
			});
		await login();

		return new SecretsReader(
			new InfisicalSecretsBackend(
				client as unknown as InfisicalLikeClient,
				environment.INFISICAL_PROJECT_ID!,
				environment.INFISICAL_ENVIRONMENT!,
				DEFAULT_SECRET_TTL_SECONDS,
				login
			)
		);
	}
}

let readerPromise: Promise<SecretsReader> | undefined;

/** Reset the process-wide reader. Tests use this to isolate cases. */
export function resetSecretsReader(): void {
	readerPromise = undefined;
}

export function secretsReader(environment: Environment = process.env): Promise<SecretsReader> {
	return (readerPromise ??= SecretsReader.fromEnv(environment).catch((error) => {
		readerPromise = undefined;
		throw error;
	}));
}

/**
 * Pull every application key through the secrets reader and publish it on the
 * environment. Safe to call on every request: reads are served from the
 * backend's TTL cache, so Infisical is consulted at most once per TTL window.
 */
export async function hydrateEnvironment({
	environment = process.env,
	reader
}: { environment?: Environment; reader?: SecretsReader } = {}): Promise<Environment> {
	const secrets = reader ?? (await secretsReader(environment));

	for (const key of APPLICATION_KEYS) {
		if (isPlatformKey(key)) continue;
		const value = (await secrets.readOptional(key))?.trim();
		const fallback = APPLICATION_DEFAULTS[key as keyof typeof APPLICATION_DEFAULTS];
		if (value) environment[key] = value;
		else if (fallback !== undefined) environment[key] = fallback;
		else delete environment[key];
	}

	const missing = REQUIRED_APPLICATION_KEYS.filter((key) => !environment[key]?.trim());
	if (missing.length > 0)
		throw new Error(
			`Application configuration is missing required variable${
				missing.length === 1 ? '' : 's'
			}: ${missing.join(', ')}`
		);

	return environment;
}

interface CookieJar {
	get(name: string): string | undefined;
	set(name: string, value: string, options: CookieOptions): void;
	delete(name: string, options: { path: string }): void;
}

interface CookieOptions {
	path: string;
	httpOnly: boolean;
	secure: boolean;
	sameSite: 'lax';
	maxAge: number;
}

const cookieOptions = (secure: boolean, maxAge: number): CookieOptions => ({
	path: '/',
	httpOnly: true,
	secure,
	sameSite: 'lax',
	maxAge
});

export const getSessionCookie = (cookies: Pick<CookieJar, 'get'>): string | null =>
	cookies.get('session') ?? null;

export const setSessionCookie = (
	cookies: Pick<CookieJar, 'set'>,
	sessionId: string,
	secure: boolean
): void => cookies.set('session', sessionId, cookieOptions(secure, 60 * 60 * 24 * 30));

export const deleteSessionCookie = (cookies: Pick<CookieJar, 'delete'>): void =>
	cookies.delete('session', { path: '/' });

export const getPkceCookie = (
	cookies: Pick<CookieJar, 'get'>,
	state: string
): { codeVerifier: string; state: string } | null => {
	const data = cookies.get(`oauth_${state}`);
	if (!data) return null;
	try {
		return JSON.parse(data) as { codeVerifier: string; state: string };
	} catch {
		return null;
	}
};

export const setPkceCookie = (
	cookies: Pick<CookieJar, 'set'>,
	state: string,
	codeVerifier: string,
	secure: boolean
): void =>
	cookies.set(
		`oauth_${state}`,
		JSON.stringify({ codeVerifier, state }),
		cookieOptions(secure, 600)
	);

export const deletePkceCookie = (cookies: Pick<CookieJar, 'delete'>, state: string): void =>
	cookies.delete(`oauth_${state}`, { path: '/' });
