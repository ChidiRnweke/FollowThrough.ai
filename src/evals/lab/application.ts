import { fileURLToPath } from 'node:url';
import { createApplication, type ProductionApplication } from '$lib/server/application';
import { Embeddings } from '$lib/server/services/retrieval/embeddings';
import { SearchRanking } from '$lib/server/services/retrieval/ranking';
import { ConversationSummary } from '$lib/server/services/conversations/summary';
import { DEFAULT_GENERATION_MODEL, DEFAULT_LANGUAGE_MODEL_BASE_URL } from '$lib/server/config';
import { config as loadDotenv } from 'dotenv';
import { DiskCache } from './cache/disk-cache';
import { CachedCondenser, CachedEmbeddingClient, CachedReranker } from './cache/cached-clients';
import type { Database } from '$lib/server/db';
import type { EmbeddingClient } from '$lib/server/services';
import { InMemoryAttachmentStorage, StubModelCatalog } from './fakes';
import { createPGliteDatabase } from './pglite-database';

const CACHE_PATH = fileURLToPath(new URL('../fixtures/auxiliary-cache.json', import.meta.url));

export interface Lab extends ProductionApplication {
	readonly model: string;
	/**
	 * Exposed so tool-retrieval can be evaluated on its own, without paying for a
	 * full agent turn. Whether the catalog surfaces the right tool for a goal is
	 * a property of the retriever, and testing it directly covers dozens of tools
	 * in the time one agent case takes.
	 */
	readonly embeddingClient: EmbeddingClient;
	/**
	 * Raw database handle, used only by the seeding helpers to backdate
	 * `createdAt` on fixtures. Every write otherwise goes through the real
	 * controllers so the search index and revision history are produced exactly
	 * as production would.
	 */
	readonly db: Database;
	close(): Promise<void>;
}

export interface LabOptions {
	/** Defaults to EVAL_MODEL, so a sweep is the same suite under a different env var. */
	readonly model?: string;
}

/**
 * The production graph backed by an in-process PGlite database, with only the
 * non-deterministic external edges replaced: attachments stay in memory, the
 * model catalog stops calling OpenRouter, and the auxiliary LLM calls replay
 * from disk. The agent loop, tool registry, controllers and repositories are
 * exactly what runs in production.
 */
export async function createLab(options: LabOptions = {}): Promise<Lab> {
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
	const baseURL = process.env.OPENROUTER_BASE_URL ?? DEFAULT_LANGUAGE_MODEL_BASE_URL;
	const appURL = 'http://localhost:5173';

	const { database, transactionRunner, close: closeDatabase } = await createPGliteDatabase();

	const cache = new DiskCache(CACHE_PATH);
	const clientOptions = { baseURL, appURL };
	const embeddingClient = new CachedEmbeddingClient(
		new Embeddings(openRouterApiKey, clientOptions),
		cache
	);

	const application = createApplication({
		db: database,
		transactionRunner,
		openRouterApiKey,
		// Evals never upload attachments, so OCR is wired but never called.
		mistralApiKey: process.env.MISTRAL_API_KEY ?? 'eval-unused',
		openRouterBaseURL: baseURL,
		appURL,
		defaultAgentModel: model,
		overrides: {
			embeddingClient,
			reranker: new CachedReranker(new SearchRanking(openRouterApiKey, clientOptions), cache),
			condenser: new CachedCondenser(
				new ConversationSummary(openRouterApiKey, clientOptions),
				cache
			),
			attachmentStorage: new InMemoryAttachmentStorage(),
			modelCatalog: new StubModelCatalog()
		}
	});

	return {
		...application,
		model,
		embeddingClient,
		db: database,
		async close() {
			await cache.flush();
			await closeDatabase();
		}
	};
}
