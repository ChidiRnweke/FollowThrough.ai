import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createApplication, type ProductionApplication } from '$lib/server/application';
import { OpenAIEmbeddingClient } from '$lib/server/domain/openai-embedding-capabilities';
import { OpenRouterReranker } from '$lib/server/domain/openrouter-rerank-capabilities';
import { ConversationCondenser } from '$lib/server/domain/conversation-condenser';
import {
	DEFAULT_GENERATION_MODEL,
	DEFAULT_OPENROUTER_BASE_URL
} from '$lib/server/domain/openrouter-client';
import { config as loadDotenv } from 'dotenv';
import { DiskCache } from './cache/disk-cache';
import { CachedCondenser, CachedEmbeddingClient, CachedReranker } from './cache/cached-clients';
import { InMemoryAttachmentStorage, StubModelCatalog } from './fakes';

const CACHE_PATH = fileURLToPath(new URL('../fixtures/auxiliary-cache.json', import.meta.url));

export interface Lab extends ProductionApplication {
	readonly model: string;
	close(): Promise<void>;
}

export interface LabOptions {
	readonly databaseUrl: string;
	/** Defaults to EVAL_MODEL, so a sweep is the same suite under a different env var. */
	readonly model?: string;
}

/**
 * The production graph, pointed at a testcontainer database, with only the
 * non-deterministic external edges replaced: attachments stay in memory, the
 * model catalog stops calling OpenRouter, and the auxiliary LLM calls replay
 * from disk. The agent loop, tool registry, controllers and repositories are
 * exactly what runs in production.
 */
export async function createLab(options: LabOptions): Promise<Lab> {
	loadDotenv({ quiet: true });
	const openRouterApiKey = process.env.OPENROUTER_API_KEY;
	if (!openRouterApiKey)
		throw new Error('OPENROUTER_API_KEY is required to run evals against a real model.');

	// Defaults to whatever production would pick, so a bare run measures the
	// deployed configuration rather than an eval-only one.
	const model =
		options.model ??
		process.env.EVAL_MODEL ??
		process.env.OPENROUTER_DEFAULT_MODEL ??
		DEFAULT_GENERATION_MODEL;
	const baseURL = process.env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL;
	const appURL = 'http://localhost:5173';

	const client = postgres(options.databaseUrl, { max: 4 });
	const { database, transactionRunner } = createTransactionContext(drizzle(client, { schema }));

	const cache = new DiskCache(CACHE_PATH);
	const clientOptions = { baseURL, appURL };

	const application = createApplication({
		db: database,
		transactionRunner,
		openRouterApiKey,
		openRouterBaseURL: baseURL,
		appURL,
		defaultAgentModel: model,
		overrides: {
			embeddingClient: new CachedEmbeddingClient(
				new OpenAIEmbeddingClient(openRouterApiKey, clientOptions),
				cache
			),
			reranker: new CachedReranker(new OpenRouterReranker(openRouterApiKey, clientOptions), cache),
			condenser: new CachedCondenser(
				new ConversationCondenser(openRouterApiKey, clientOptions),
				cache
			),
			attachmentStorage: new InMemoryAttachmentStorage(),
			modelCatalog: new StubModelCatalog()
		}
	});

	return {
		...application,
		model,
		async close() {
			await cache.flush();
			await client.end();
		}
	};
}
