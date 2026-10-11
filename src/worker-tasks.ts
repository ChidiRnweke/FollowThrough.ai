/**
 * The worker's fan-out ticks. Each lists work across every user through a system controller,
 * then runs every item as the user it belongs to. They take controllers rather than the
 * composition so a test can run the same tick over in-memory controllers.
 */
import type { ActorContext } from '$lib/models/identity';
import type { IndexSource } from '$lib/models/knowledge-search';
import type { ScheduledTask } from '$lib/models/maintenance';
import type { AttachmentProcessingController } from '$lib/server/controllers/attachment-processing/controller';
import type { AttachmentBacklogController } from '$lib/server/controllers/attachments/backlog';
import type {
	EmbeddingBacklogController,
	KnowledgeIndexingController
} from '$lib/server/controllers/knowledge-indexing/controller';

export interface TaskLogger {
	error(message: string, error: unknown): void;
	log(message: string): void;
}

/**
 * Fills in the vectors the write path deliberately skipped. Failures are per source: one
 * poisoned document must not stall every other user's index, and a failed source stays pending
 * without monopolizing the next tick.
 */
export const embeddingBackfill = (
	controllers: {
		backlog(): EmbeddingBacklogController;
		indexingFor(actor: ActorContext): KnowledgeIndexingController;
	},
	settings: { intervalMs: number; maxSourcesPerTick: number },
	logger: TaskLogger = console
): ScheduledTask => ({
	name: 'embedding-backfill',
	intervalMs: settings.intervalMs,
	async run() {
		const backlog = controllers.backlog();
		const pending = await backlog.next(settings.maxSourcesPerTick);
		if (!pending.length) return;
		let embedded = 0;
		let failed = 0;
		for (const entry of pending) {
			try {
				embedded += await controllers.indexingFor({ userId: entry.userId }).backfill(entry.source);
				// audit-allow: silent-catch — the batch counts and reports this failed source while leaving it pending for retry.
			} catch (error) {
				failed += 1;
				logger.error(
					`[embedding-backfill] ${entry.source.kind} ${sourceId(entry.source)} failed:`,
					error
				);
			} finally {
				await backlog.advance(entry.cursor);
			}
		}
		logger.log(
			`[embedding-backfill] embedded ${embedded} chunk(s) across ${pending.length - failed} source(s)` +
				(failed ? `, ${failed} failed` : '')
		);
	}
});

/** Extracts queued and interrupted attachment versions, each as the user it belongs to. */
export const attachmentProcessing = (
	controllers: {
		backlog(): AttachmentBacklogController;
		processingFor(actor: ActorContext): AttachmentProcessingController;
	},
	logger: TaskLogger = console
): ScheduledTask => ({
	name: 'attachment-processing',
	intervalMs: 1000,
	async run() {
		for (const item of await controllers.backlog().pendingVersions()) {
			const result = await controllers
				.processingFor({ userId: item.userId })
				.process(item.versionId);
			if (result.kind === 'failure') logger.error('Attachment processing failed', result.message);
		}
	}
});

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
