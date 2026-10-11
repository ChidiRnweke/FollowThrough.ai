import type { ScheduledTask } from '$lib/models/maintenance';
import type { EmbeddingProgressStore } from '$lib/server/stores/maintenance/embedding-progress';
import type { ActorContext } from '$lib/models/identity';
import type { IndexSource, PendingIndexSource } from '$lib/models/knowledge-search';
import type { IndexBackfill } from '$lib/server/services/knowledge-search/retrieval';

interface TransactionRunner {
	run<T>(work: () => Promise<T>): Promise<T>;
}

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_SOURCES = 200;
export interface EmbeddingBackfillOptions {
	readonly intervalMs?: number;
	readonly maxSourcesPerTick?: number;
	readonly logger?: Pick<Console, 'error' | 'log'>;
}

/**
 * Fills in the vectors that the write path deliberately skipped.
 *
 * There is no job table: the queue is `search_chunks` rows with no embedding, so
 * the backlog is exactly the durable state and a crashed tick simply leaves work
 * for the next one. Failures are per-source — one poisoned document must not
 * stall every other user's index.
 */
export class EmbeddingMaintenance implements ScheduledTask {
	readonly name = 'embedding-backfill';
	readonly intervalMs: number;
	private readonly maxSourcesPerTick: number;
	private readonly logger: Pick<Console, 'error' | 'log'>;

	constructor(
		private readonly backlog: IndexBackfill,
		private readonly transactions: TransactionRunner,
		private readonly progress: EmbeddingProgressStore,
		options: EmbeddingBackfillOptions = {}
	) {
		this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
		this.maxSourcesPerTick = options.maxSourcesPerTick ?? DEFAULT_MAX_SOURCES;
		this.logger = options.logger ?? console;
	}

	async run(): Promise<void> {
		let pending = await this.backlog.pendingSources(this.maxSourcesPerTick, this.progress.read());
		if (!pending.length && this.progress.read() !== undefined) {
			this.progress.update(undefined);
			pending = await this.backlog.pendingSources(this.maxSourcesPerTick);
		}
		if (!pending.length) return;

		let embedded = 0;
		let failed = 0;
		for (const entry of pending) {
			try {
				embedded += await this.backfill(entry);
				// audit-allow: silent-catch — the scheduled batch counts and reports this failed source while leaving it pending for retry.
			} catch (error) {
				failed += 1;
				this.logger.error(
					`[embedding-backfill] ${entry.source.kind} ${sourceId(entry.source)} failed:`,
					error
				);
			} finally {
				// Failed sources stay pending, but cannot monopolize the next tick.
				this.progress.update(entry.cursor);
			}
		}
		this.logger.log(
			`[embedding-backfill] embedded ${embedded} chunk(s) across ${pending.length - failed} source(s)` +
				(failed ? `, ${failed} failed` : '')
		);
	}

	private async backfill(entry: PendingIndexSource): Promise<number> {
		const actor: ActorContext = { userId: entry.userId };
		// Embedding happens outside the transaction: it is a network call to a third
		// party, and holding row locks across it is the very thing this worker exists
		// to stop the request path from doing.
		const embedded = await this.backlog.embedPending(actor, entry.source);
		if (!embedded.chunks.length) return 0;
		await this.transactions.run(() => this.backlog.completePending(actor, embedded));
		return embedded.chunks.length;
	}
}

const sourceId = (source: IndexSource): string => {
	switch (source.kind) {
		case 'note':
			return source.noteId;
		case 'diagram':
			return source.diagramId;
		case 'widget':
			return source.widgetId;
		case 'memory':
			return source.memoryEntryId;
		case 'attachment':
			return source.attachmentId;
	}
};
