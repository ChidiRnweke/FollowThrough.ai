import { Cl100kTokenizer } from '$lib/server/infrastructure/tokenization/cl100k';
import { PostgresAttachmentClaims } from '$lib/server/repositories/attachments/postgres/claims';
import {
	db,
	postgresTransactionRunner,
	postgresSessionConnections,
	postgresConnectionScope,
	postgresNotifications
} from '$lib/server/db';
import {
	DEFAULT_GENERATION_MODEL,
	DEFAULT_LANGUAGE_MODEL_BASE_URL,
	DEFAULT_MISTRAL_BASE_URL,
	DEFAULT_OCR_MODEL,
	connectorClientKeys,
	requiredEnvironmentValue
} from '../config';
import type { ActorContext } from '$lib/models/identity';
import {
	createApplication,
	type ApplicationConfig,
	type ProductionApplication
} from '../application';
import { systemClock } from './system-clock';
import type { ConnectorConfiguration } from './capabilities/connectors-capability-factory';
import { SecretBox } from '$lib/server/infrastructure/crypto/secret-box';
import { OutboundGuard, publicAddressFetch } from '$lib/server/infrastructure/network/outbound';
import { CONNECTOR_CATALOG, type CatalogConnectorId } from '$lib/models/connectors';
import type { ClientCredentials } from '$lib/server/services/connectors/authorization';
import { createSystemApplication, type SystemApplication } from './system-factory';

export type { ProductionApplication } from '../application';

/**
 * Reads the environment and hands the resulting configuration to
 * `createApplication`. Kept separate from the wiring itself so that isolated
 * runners can build the same graph with their own database implementation.
 * The production database resolves `DATABASE_URL` lazily on first use, after
 * the process launcher has loaded runtime configuration.
 */
/**
 * The process composition: configuration and process-wide resources (the database pool, the
 * notification channel, the token codec) are built once; each request builds its own graph.
 */
export interface ProductionComposition {
	/** The graph for one user: a request's authenticated actor, or the owner of listed work. */
	forActor(actor: ActorContext): ProductionApplication;
	/** The graph for work that acts for no user: startup recovery and the worker's tasks. */
	system(): SystemApplication;
}

export function createProductionComposition(): ProductionComposition {
	const config = productionConfig();
	return {
		forActor: (actor) => createApplication(actor, config),
		system: () => createSystemApplication(config)
	};
}

function productionConfig(): ApplicationConfig {
	return {
		now: systemClock,
		attachmentClaims: new PostgresAttachmentClaims(
			postgresSessionConnections,
			postgresConnectionScope
		),
		db,
		notifications: postgresNotifications,
		transactionRunner: postgresTransactionRunner,
		tokenizer: new Cl100kTokenizer(),
		openRouterApiKey: requiredEnvironmentValue('OPENROUTER_API_KEY'),
		// The worker sidecar owns embedding in production, so writes never wait on
		// OpenRouter. Set DEFER_EMBEDDING=false to fall back to inline embedding if
		// the worker is not deployed.
		deferEmbedding: process.env.DEFER_EMBEDDING !== 'false',
		openRouterBaseURL: process.env.OPENROUTER_BASE_URL ?? DEFAULT_LANGUAGE_MODEL_BASE_URL,
		appURL: process.env.ORIGIN ?? 'http://localhost:5173',
		defaultAgentModel: process.env.OPENROUTER_DEFAULT_MODEL ?? DEFAULT_GENERATION_MODEL,
		mistralApiKey: requiredEnvironmentValue('MISTRAL_API_KEY'),
		mistralBaseURL: process.env.MISTRAL_BASE_URL ?? DEFAULT_MISTRAL_BASE_URL,
		ocrModel: process.env.MISTRAL_OCR_MODEL ?? DEFAULT_OCR_MODEL,
		recommendedModels: (process.env.OPENROUTER_RECOMMENDED_MODELS ?? '')
			.split(',')
			.map((model) => model.trim())
			.filter(Boolean),
		connectors: connectorConfiguration(),
		s3: {
			endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
			region: process.env.S3_REGION ?? 'us-east-1',
			accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'followthrough',
			secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'followthrough-local-secret',
			bucket: process.env.S3_BUCKET ?? 'followthrough-attachments',
			forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false'
		}
	};
}

/**
 * Connectors turn on with CONNECTOR_SECRET_KEYS. A keyring that does not parse
 * fails the composition rather than turning connectors off, and a preregistered
 * client needs both of its keys.
 */
function connectorConfiguration(): ConnectorConfiguration {
	const keyring = process.env.CONNECTOR_SECRET_KEYS;
	if (!keyring) return { kind: 'unconfigured' };
	const preregistered = new Map<CatalogConnectorId, ClientCredentials>();
	for (const { id } of CONNECTOR_CATALOG.filter(
		(entry) =>
			entry.authentication.kind === 'oauth' && entry.authentication.registration === 'preregistered'
	)) {
		const keys = connectorClientKeys(id);
		const clientId = process.env[keys.clientId];
		const clientSecret = process.env[keys.clientSecret];
		if ((clientId === undefined) !== (clientSecret === undefined))
			throw new Error(`Set both ${keys.clientId} and ${keys.clientSecret}, or neither.`);
		if (clientId !== undefined && clientSecret !== undefined)
			preregistered.set(id, { clientId, clientSecret });
	}
	return {
		kind: 'configured',
		secrets: SecretBox.fromKeyring(keyring),
		origin: requiredEnvironmentValue('ORIGIN'),
		preregistered,
		fetch: new OutboundGuard(publicAddressFetch()).fetch
	};
}
