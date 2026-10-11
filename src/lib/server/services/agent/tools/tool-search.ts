import { createHash } from 'node:crypto';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';
import type {
	ToolDescriptor,
	ToolEmbeddingSeedSummary,
	ToolSeed
} from '$lib/models/agent/tool-index';
import { EMBEDDING_BATCH_TOKENS } from '$lib/models/knowledge-search/embeddings';
import type { OperationObserver } from '$lib/models/telemetry';
import type { TokenCounter } from '$lib/models/tokenization';
import type { ToolEmbeddingRepository } from '$lib/server/repositories/agent/tool-embeddings';
import { getEmbeddingAttributes } from '@arizeai/openinference-core';
import { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';
import type OpenAI from 'openai';

const toolEmbeddingText = (entry: ToolDescriptor): string =>
	`${entry.name}: ${entry.retrievalText ?? entry.description}`;

const toolContentHash = (entry: ToolDescriptor): string =>
	createHash('sha256').update(toolEmbeddingText(entry)).digest('hex');

export interface ToolSearchDependencies {
	readonly repository: ToolEmbeddingRepository;
	/** OpenAI-compatible client for tool and query embeddings. */
	readonly provider: Pick<OpenAI, 'embeddings'>;
	readonly model: string;
	readonly tokens: TokenCounter;
	readonly observer: OperationObserver;
}

export interface ToolSeeding {
	/** Compare the catalog with stored vectors and embed what changed. No write. */
	prepareSeed(catalog: readonly ToolDescriptor[]): Promise<ToolSeed>;
	completeSeed(seed: ToolSeed): Promise<ToolEmbeddingSeedSummary>;
}
export interface ToolRanking {
	/** The `limit` tools among `names` closest to `query`. */
	rank(names: readonly string[], query: string, limit: number): Promise<string[]>;
}

/** Semantic search over the agent's tool catalog. The embedding provider belongs to it. */
export class ToolSearch implements ToolSeeding, ToolRanking {
	constructor(private readonly dependencies: ToolSearchDependencies) {}

	async prepareSeed(catalog: readonly ToolDescriptor[]): Promise<ToolSeed> {
		const { model, repository } = this.dependencies;
		const existing = new Map((await repository.list()).map((row) => [row.name, row]));
		const names = catalog.map((entry) => entry.name);
		const desired = new Set(names);
		const pending = catalog
			.filter((entry) => {
				const stored = existing.get(entry.name);
				return (
					!stored ||
					stored.contentHash !== toolContentHash(entry) ||
					stored.embeddingModel !== model
				);
			})
			.map((entry) => ({
				name: entry.name,
				description: entry.description,
				contentHash: toolContentHash(entry),
				input: toolEmbeddingText(entry)
			}));
		const plan = {
			names,
			model,
			pending,
			removed: [...existing.keys()].filter((name) => !desired.has(name)).length
		};
		const vectors = await this.embed(pending.map((entry) => entry.input));
		if (vectors.length !== pending.length)
			throw new InvalidGeneratedContentError(
				'Tool embedding results did not match the prepared catalog'
			);
		return { plan, vectors };
	}

	async completeSeed({ plan, vectors }: ToolSeed): Promise<ToolEmbeddingSeedSummary> {
		await this.dependencies.repository.upsert(
			plan.pending.map((entry, index) => ({
				name: entry.name,
				description: entry.description,
				contentHash: entry.contentHash,
				embeddingModel: plan.model,
				embedding: vectors[index]!
			}))
		);
		await this.dependencies.repository.deleteExcept(plan.names);
		return {
			embedded: plan.pending.length,
			unchanged: plan.names.length - plan.pending.length,
			removed: plan.removed
		};
	}

	async rank(names: readonly string[], query: string, limit: number): Promise<string[]> {
		if (!names.length) return [];
		const vectors = await this.embed([query]);
		const vector = vectors[0];
		if (vectors.length !== 1 || !vector)
			throw new InvalidGeneratedContentError('Tool search requires one query embedding');
		const ranked = await this.dependencies.repository.rankByVector(
			vector,
			names,
			names.length,
			this.dependencies.model
		);
		const available = new Set(ranked);
		const missing = names.filter((name) => !available.has(name));
		// A missing seed is a deployment fault, not an upstream outage: no retry can
		// fill the index. It reaches the model as an internal fault ("do not retry"),
		// and the detail reaches the operator through boundary logging (ADR 0022).
		if (missing.length)
			throw new Error(
				'Tool search index is incomplete. Run the tool-embedding seed (pnpm db:seed:tools).',
				{ cause: 'Missing current-model vectors for: ' + missing.join(', ') }
			);
		return ranked.slice(0, limit);
	}

	/** Ordered provider requests within the batch budget; no input is discarded or split. */
	private async embed(contents: readonly string[]): Promise<readonly (readonly number[])[]> {
		const vectors: (readonly number[])[] = [];
		let batch: string[] = [];
		let tokens = 0;
		for (const content of contents) {
			const count = this.dependencies.tokens.count(content);
			if (batch.length && tokens + count > EMBEDDING_BATCH_TOKENS) {
				vectors.push(...(await this.request(batch)));
				batch = [];
				tokens = 0;
			}
			batch.push(content);
			tokens += count;
		}
		if (batch.length) vectors.push(...(await this.request(batch)));
		return vectors;
	}

	private async request(contents: readonly string[]): Promise<readonly (readonly number[])[]> {
		const { model, observer, provider } = this.dependencies;
		try {
			return await observer.run(
				'embedding.batch',
				{
					input: JSON.stringify(contents),
					inputMimeType: MimeType.JSON,
					outputMimeType: MimeType.JSON,
					kind: OpenInferenceSpanKind.EMBEDDING,
					metadata: { model, inputCount: contents.length },
					tags: ['embedding'],
					attributes: getEmbeddingAttributes({ modelName: model }),
					onlyWithinWorkflow: true
				},
				async () => {
					const response = await provider.embeddings.create({ model, input: [...contents] });
					const ordered = [...response.data].sort((a, b) => a.index - b.index);
					if (ordered.length !== contents.length || ordered.some((item, i) => item.index !== i))
						throw new InvalidGeneratedContentError(
							'Embedding results did not match input positions'
						);
					return ordered.map((item) => item.embedding);
				},
				(vectors) => JSON.stringify({ model, vectorCount: vectors.length })
			);
		} catch (error) {
			if (error instanceof InvalidGeneratedContentError) throw error;
			throw new ExternalServiceError('Embedding generation failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
