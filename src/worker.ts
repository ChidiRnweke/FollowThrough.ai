/**
 * Entrypoint for the worker sidecar.
 *
 * Runs the same application graph as the web process — same repositories, same
 * services, same configuration — but serves no HTTP and instead ticks the
 * periodic tasks the request path deliberately hands off. Deployed as a second
 * container on the same image; see `docker-compose.prod.yml`.
 */
import { createProductionComposition } from '$lib/server/factories/production-factory';
import {
	hydrateEnvironment,
	optionalProperty,
	positiveNumberFromEnvironment
} from '$lib/server/config';
import type { ProductionComposition } from '$lib/server/factories/production-factory';
import type { IndexSource } from '$lib/models/knowledge-search';
import type { ScheduledTask } from '$lib/models/maintenance';
import { createScheduler } from '$lib/server/factories/scheduler';
import {
	drainBeforeTelemetryShutdown,
	shutdownTelemetry
} from '../scripts/otel-instrumentation.js';

const shutdownTimeoutMs = Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS ?? 30_000);

/**
 * Fills in the vectors the write path deliberately skipped. The backlog spans every user; each
 * source is embedded as its owner. Failures are per source: one poisoned document must not stall
 * every other user's index, and a failed source stays pending without monopolizing the next tick.
 */
const embeddingBackfill = (composition: ProductionComposition): ScheduledTask => {
	const settings = {
		intervalMs: 10 * 60 * 1000,
		maxSourcesPerTick: 200,
		...optionalProperty('intervalMs', positiveNumberFromEnvironment('EMBEDDING_SWEEP_INTERVAL_MS')),
		...optionalProperty(
			'maxSourcesPerTick',
			positiveNumberFromEnvironment('EMBEDDING_SWEEP_MAX_SOURCES')
		)
	};
	return {
		name: 'embedding-backfill',
		intervalMs: settings.intervalMs,
		async run() {
			const backlog = composition.system().controllers.embeddingBacklog();
			const pending = await backlog.next(settings.maxSourcesPerTick);
			if (!pending.length) return;
			let embedded = 0;
			let failed = 0;
			for (const entry of pending) {
				try {
					embedded += await composition
						.forActor({ userId: entry.userId })
						.controllers.knowledgeIndexing()
						.backfill(entry.source);
					// audit-allow: silent-catch — the batch counts and reports this failed source while leaving it pending for retry.
				} catch (error) {
					failed += 1;
					console.error(
						`[embedding-backfill] ${entry.source.kind} ${sourceId(entry.source)} failed:`,
						error
					);
				} finally {
					await backlog.advance(entry.cursor);
				}
			}
			console.log(
				`[embedding-backfill] embedded ${embedded} chunk(s) across ${pending.length - failed} source(s)` +
					(failed ? `, ${failed} failed` : '')
			);
		}
	};
};

/** Extracts queued and interrupted attachment versions, each as the user it belongs to. */
const attachmentProcessing = (composition: ProductionComposition): ScheduledTask => ({
	name: 'attachment-processing',
	intervalMs: 1000,
	async run() {
		const pending = await composition.system().controllers.attachmentBacklog().pendingVersions();
		for (const item of pending) {
			const result = await composition
				.forActor({ userId: item.userId })
				.controllers.attachmentProcessing()
				.process(item.versionId);
			if (result.kind === 'failure') console.error('Attachment processing failed', result.message);
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

const main = async (): Promise<void> => {
	await hydrateEnvironment();
	const composition = createProductionComposition();
	const tasks = [
		...composition.system().tasks,
		embeddingBackfill(composition),
		attachmentProcessing(composition)
	];

	const scheduler = createScheduler(tasks, { runOnStart: true });
	scheduler.start();
	drainBeforeTelemetryShutdown(async () => {
		await scheduler.stop();
		console.log('[worker] stopped');
	});
	console.log(
		`[worker] started with ${tasks.length} task(s): ${tasks
			.map((task) => `${task.name} every ${Math.round(task.intervalMs / 1000)}s`)
			.join(', ')}`
	);

	let stopping = false;
	const shutdown = async (signal: string): Promise<void> => {
		if (stopping) return;
		stopping = true;
		console.log(`[worker] ${signal} received, finishing in-flight work`);
		// A tick that will not settle must not hold the container open past the
		// orchestrator's own kill timeout.
		const forced = setTimeout(() => {
			console.error('[worker] shutdown timed out, exiting anyway');
			process.exit(1);
		}, shutdownTimeoutMs);
		forced.unref();
		await shutdownTelemetry();
		clearTimeout(forced);
		process.exit(0);
	};

	process.on('SIGTERM', () => void shutdown('SIGTERM'));
	process.on('SIGINT', () => void shutdown('SIGINT'));
};

// audit-allow: silent-catch — this process boundary reports startup failure and exits non-zero.
main().catch((error) => {
	console.error('[worker] failed to start:', error);
	process.exit(1);
});
