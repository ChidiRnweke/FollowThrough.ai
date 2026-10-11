import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import { Cl100kTokenizer } from '$lib/server/infrastructure/tokenization/cl100k';
/**
 * Deploy-time seeder for the `tool_embeddings` table.
 *
 * Runs next to migrations (see `scripts/prod-migrate.js`, and `pnpm db:seed:tools`
 * in development) so `search_tools` ranking reads stored vectors instead of
 * embedding tool descriptions at runtime. Bundled into `build-worker/` by
 * `vite.config.worker.ts` because the runtime image ships no `src/`.
 */
import {
	DEFAULT_LANGUAGE_MODEL_BASE_URL,
	hydrateEnvironment,
	requiredEnvironmentValue
} from '$lib/server/config';
import { db } from '$lib/server/db';
import { ToolEmbeddingRecords } from '$lib/server/repositories/agent/postgres/tool-embeddings';
import { ToolDiscovery } from '$lib/server/controllers/tool-discovery/controller';
import { ToolSearch } from '$lib/server/services/agent/tools/tool-search';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createRetrievalProvider } from '$lib/server/factories/retrieval-providers';
import { DEFAULT_EMBEDDING_MODEL } from '$lib/models/knowledge-search/embeddings';

const main = async (): Promise<void> => {
	await hydrateEnvironment();
	const provider = createRetrievalProvider({
		apiKey: requiredEnvironmentValue('OPENROUTER_API_KEY'),
		baseURL: process.env.OPENROUTER_BASE_URL ?? DEFAULT_LANGUAGE_MODEL_BASE_URL,
		appURL: process.env.ORIGIN ?? 'http://localhost:5173'
	});
	const transaction = createTransactionContext(db);
	const summary = await new ToolDiscovery(
		new ToolSearch({
			repository: new ToolEmbeddingRecords(transaction.database),
			provider: provider.client,
			model: DEFAULT_EMBEDDING_MODEL,
			tokens: new Cl100kTokenizer(),
			observer: { run: (_name, _context, body) => body() }
		}),
		transaction.transactionRunner,
		new AgentToolCatalogService()
	).seed();
	console.log(
		`[seed-tool-embeddings] embedded ${summary.embedded}, unchanged ${summary.unchanged}, removed ${summary.removed}`
	);
};

// audit-allow: silent-catch — this CLI reports startup failure and exits non-zero for its caller.
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error('[seed-tool-embeddings] failed:', error);
		process.exit(1);
	});
