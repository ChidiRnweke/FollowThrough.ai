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
import { seedToolEmbeddings } from '$lib/server/services/agent/tools/tool-embedding-seed';
import { Embeddings } from '$lib/server/services/knowledge-search/embeddings';

const main = async (): Promise<void> => {
	await hydrateEnvironment();
	const embeddings = new Embeddings(requiredEnvironmentValue('OPENROUTER_API_KEY'), {
		baseURL: process.env.OPENROUTER_BASE_URL ?? DEFAULT_LANGUAGE_MODEL_BASE_URL,
		appURL: process.env.ORIGIN ?? 'http://localhost:5173'
	});
	const summary = await seedToolEmbeddings(new ToolEmbeddingRecords(db), embeddings);
	console.log(
		`[seed-tool-embeddings] embedded ${summary.embedded}, unchanged ${summary.unchanged}, removed ${summary.removed}`
	);
};

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error('[seed-tool-embeddings] failed:', error);
		process.exit(1);
	});
