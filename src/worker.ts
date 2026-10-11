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
import { createScheduler } from '$lib/server/factories/scheduler';
import { attachmentProcessing, embeddingBackfill } from './worker-tasks';
import {
	drainBeforeTelemetryShutdown,
	shutdownTelemetry
} from '../scripts/otel-instrumentation.js';

const shutdownTimeoutMs = Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS ?? 30_000);

const embeddingSettings = () => ({
	intervalMs: 10 * 60 * 1000,
	maxSourcesPerTick: 200,
	...optionalProperty('intervalMs', positiveNumberFromEnvironment('EMBEDDING_SWEEP_INTERVAL_MS')),
	...optionalProperty(
		'maxSourcesPerTick',
		positiveNumberFromEnvironment('EMBEDDING_SWEEP_MAX_SOURCES')
	)
});

const main = async (): Promise<void> => {
	await hydrateEnvironment();
	const composition = createProductionComposition();
	const tasks = [
		...composition.system().tasks,
		embeddingBackfill(
			{
				backlog: () => composition.system().controllers.embeddingBacklog(),
				indexingFor: (actor) => composition.forActor(actor).controllers.knowledgeIndexing()
			},
			embeddingSettings()
		),
		attachmentProcessing({
			backlog: () => composition.system().controllers.attachmentBacklog(),
			processingFor: (actor) => composition.forActor(actor).controllers.attachmentProcessing()
		})
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
