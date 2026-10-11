import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
const toolCatalogRules = new AgentToolCatalogService();
import { InMemoryAttachmentClaims } from '$lib/testing/attachments/fakes/claims';
import { fileURLToPath } from 'node:url';
import { createApplication, type ProductionApplication } from '$lib/server/application';
import { DEFAULT_GENERATION_MODEL, DEFAULT_LANGUAGE_MODEL_BASE_URL } from '$lib/server/config';
import { config as loadDotenv } from 'dotenv';
import { DiskCache } from './cache/disk-cache';
import { cachedRetrievalFetch } from './cache/cached-clients';
import { createRetrievalProvider } from '$lib/server/factories/retrieval-providers';
import { KnowledgeRetrieval } from '$lib/server/services/knowledge-search/retrieval';
import { ToolSearch } from '$lib/server/services/agent/tools/tool-search';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { ToolEmbeddingRecords } from '$lib/server/repositories/agent/postgres/tool-embeddings';
import { Cl100kTokenizer } from '$lib/server/infrastructure/tokenization/cl100k';
import { operationObserver } from '$lib/server/infrastructure/telemetry/tracing';
import { DEFAULT_EMBEDDING_MODEL } from '$lib/models/knowledge-search/embeddings';
import { DEFAULT_SEARCH_QUERY_MODEL } from '$lib/models/knowledge-search/query-generation';
import type { Database } from '$lib/server/db';
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
	/**
	 * Raw database handle, used by seeding helpers for explicit account initialization and to backdate
	 * `createdAt` on fixtures. Content writes go through the real
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

	const {
		database,
		transactionRunner,
		notifications,
		close: closeDatabase
	} = await createPGliteDatabase();

	const cache = new DiskCache(CACHE_PATH);
	// The tool catalog's discovery texts are fixed by the catalog, so their embeddings must
	// replay; the agent's own search wording varies run to run and may call the provider.
	const deterministicToolTexts = new Set(
		toolCatalogRules
			.discoverable()
			.map((entry) => `${entry.name}: ${entry.retrievalText ?? entry.description}`)
	);
	// The lab replaces both retrieval services with ones whose providers replay from the cache.
	const provider = createRetrievalProvider({
		apiKey: openRouterApiKey,
		baseURL,
		appURL,
		fetch: cachedRetrievalFetch(cache, globalThis.fetch, (content) =>
			deterministicToolTexts.has(content)
		)
	});
	const tokenizer = new Cl100kTokenizer();
	const observer = { run: operationObserver.run };
	const knowledge = new KnowledgeRetrieval({
		repository: new KnowledgeIndexRecords(database),
		provider: provider.client,
		rerank: provider.rerank,
		models: { embedding: DEFAULT_EMBEDDING_MODEL, query: DEFAULT_SEARCH_QUERY_MODEL },
		encoding: tokenizer,
		chunking: { targetTokens: 2400, overlapTokens: 480 },
		defer: false,
		observer
	});
	const toolSearch = new ToolSearch({
		repository: new ToolEmbeddingRecords(database),
		provider: provider.client,
		model: DEFAULT_EMBEDDING_MODEL,
		tokens: tokenizer,
		observer
	});

	const application = createApplication({
		attachmentClaims: new InMemoryAttachmentClaims(),
		db: database,
		notifications,
		transactionRunner,
		tokenizer,
		openRouterApiKey,
		// Evals never upload attachments, so OCR is wired but never called.
		mistralApiKey: process.env.MISTRAL_API_KEY ?? 'eval-unused',
		openRouterBaseURL: baseURL,
		appURL,
		defaultAgentModel: model,
		overrides: {
			knowledge,
			toolSearch,
			attachmentStorage: new InMemoryAttachmentStorage(),
			modelCatalog: new StubModelCatalog()
		}
	});

	// Tool discovery ranks against stored vectors. An unseeded database now fails
	// explicitly rather than making every long-tail tool appear unavailable.
	// Deploys run this seed next to migrations; the lab has to do the same or it
	// evaluates a configuration that never ships.
	await application.toolRetriever.seed();

	return {
		...application,
		model,
		db: database,
		async close() {
			const stats = cache.stats();
			process.stderr.write(
				`[evals] cache hits=${stats.hits} misses=${stats.misses} live=${stats.live}\n`
			);
			await cache.flush();
			await closeDatabase();
		}
	};
}
