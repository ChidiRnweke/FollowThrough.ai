import type { ActorContext, SearchDocument } from '$lib/models';
import type {
	EmbeddedChunk,
	IndexSource,
	PendingIndexSource,
	RetrievalIndexRepository,
	TransactionRunner
} from '$lib/server/repositories';
import {
	embedInStableBatches,
	type EmbeddingClient
} from '$lib/server/services/retrieval/indexing';
import type { ScheduledTask } from '$lib/server/services/scheduler';

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_SOURCES = 200;
export interface EmbeddingBackfillOptions {
	readonly intervalMs?: number;
	readonly maxSourcesPerTick?: number;
	readonly logger?: Pick<Console, 'error' | 'log'>;
}

/**
 * Chunks are embedded together with the context their indexer prefixed, so a
 * backfilled vector is identical to the one an inline embed would have produced.
 * Attachments key off their full path; everything else off its source title.
 */
const embedInputFor = (document: SearchDocument): string => {
	const prefix = document.attachmentId ? document.attachmentPath : document.sourceTitle;
	return prefix ? `${prefix}\n${document.content}` : document.content;
};

/**
 * Fills in the vectors that the write path deliberately skipped.
 *
 * There is no job table: the queue is `search_chunks` rows with no embedding, so
 * the backlog is exactly the durable state and a crashed tick simply leaves work
 * for the next one. Failures are per-source — one poisoned document must not
 * stall every other user's index.
 */
export class KnowledgeIndexMaintenance implements ScheduledTask {
	readonly name = 'embedding-backfill';
	readonly intervalMs: number;
	private readonly maxSourcesPerTick: number;
	private readonly logger: Pick<Console, 'error' | 'log'>;

	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient,
		private readonly transactions: TransactionRunner,
		options: EmbeddingBackfillOptions = {}
	) {
		this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
		this.maxSourcesPerTick = options.maxSourcesPerTick ?? DEFAULT_MAX_SOURCES;
		this.logger = options.logger ?? console;
	}

	async run(): Promise<void> {
		const pending = await this.repository.listPendingSources(this.maxSourcesPerTick);
		if (!pending.length) return;

		let embedded = 0;
		let failed = 0;
		for (const entry of pending) {
			try {
				embedded += await this.backfill(entry);
			} catch (error) {
				failed += 1;
				this.logger.error(
					`[embedding-backfill] ${entry.source.kind} ${sourceId(entry.source)} failed:`,
					error
				);
			}
		}
		this.logger.log(
			`[embedding-backfill] embedded ${embedded} chunk(s) across ${pending.length - failed} source(s)` +
				(failed ? `, ${failed} failed` : '')
		);
	}

	private async backfill(entry: PendingIndexSource): Promise<number> {
		const actor: ActorContext = { userId: entry.userId };
		const documents = await this.repository.listPending(actor, entry.source);
		if (!documents.length) return 0;

		// Embedding happens outside the transaction: it is a network call to a third
		// party, and holding row locks across it is the very thing this worker exists
		// to stop the request path from doing.
		const vectors = await embedInStableBatches(this.embeddingClient, documents.map(embedInputFor));
		const embedded: EmbeddedChunk[] = documents.map((document, index) => ({
			id: document.id,
			embedding: vectors[index]!
		}));

		await this.transactions.run(() =>
			this.repository.completePending(actor, entry.source, embedded, this.embeddingClient.model)
		);
		return embedded.length;
	}
}

const sourceId = (source: IndexSource): string => {
	switch (source.kind) {
		case 'note':
			return source.noteId;
		case 'diagram':
			return source.diagramId;
		case 'memory':
			return source.memoryEntryId;
		case 'attachment':
			return source.attachmentId;
	}
};
