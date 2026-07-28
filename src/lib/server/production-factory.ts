import { db, postgresTransactionRunner } from '$lib/server/db';
import { DEFAULT_GENERATION_MODEL, DEFAULT_OPENROUTER_BASE_URL } from './domain/openrouter-client';
import { createApplication, type ProductionApplication } from './application';

export type { ProductionApplication } from './application';

/**
 * Reads the environment and hands the resulting configuration to
 * `createApplication`. Kept separate from the wiring itself so that isolated
 * runners can build the same graph with their own database implementation.
 * The production database resolves `DATABASE_URL` lazily on first use, after
 * the process launcher has loaded runtime configuration.
 */
export function createProductionFactory(): ProductionApplication {
	const openRouterApiKey = process.env.OPENROUTER_API_KEY;
	if (!openRouterApiKey) {
		throw new Error(
			'OPENROUTER_API_KEY is required. Refusing to start with AI features silently disabled.'
		);
	}
	return createApplication({
		db,
		transactionRunner: postgresTransactionRunner,
		openRouterApiKey,
		// The worker sidecar owns embedding in production, so writes never wait on
		// OpenRouter. Set DEFER_EMBEDDING=false to fall back to inline embedding if
		// the worker is not deployed.
		deferEmbedding: process.env.DEFER_EMBEDDING !== 'false',
		openRouterBaseURL: process.env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL,
		appURL: process.env.ORIGIN ?? 'http://localhost:5173',
		defaultAgentModel: process.env.OPENROUTER_DEFAULT_MODEL ?? DEFAULT_GENERATION_MODEL,
		recommendedModels: (process.env.OPENROUTER_RECOMMENDED_MODELS ?? '')
			.split(',')
			.map((model) => model.trim())
			.filter(Boolean),
		s3: {
			endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
			region: process.env.S3_REGION ?? 'us-east-1',
			accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'followthrough',
			secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'followthrough-local-secret',
			bucket: process.env.S3_BUCKET ?? 'followthrough-attachments',
			forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false'
		}
	});
}
