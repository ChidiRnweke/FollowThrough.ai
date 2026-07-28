/**
 * Entrypoint for the worker sidecar.
 *
 * Runs the same application graph as the web process — same repositories, same
 * services, same configuration — but serves no HTTP and instead ticks the
 * periodic tasks the request path deliberately hands off. Deployed as a second
 * container on the same image; see `docker-compose.prod.yml`.
 */
import { createProductionFactory } from '$lib/server/production-factory';
import { hydrateEnvironment } from '$lib/server/secrets';
import { startScheduler } from '$lib/server/workers/scheduler';

const shutdownTimeoutMs = Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS ?? 30_000);
const telemetryFlushMs = Number(process.env.WORKER_TELEMETRY_FLUSH_MS ?? 2_000);

const main = async (): Promise<void> => {
	await hydrateEnvironment();
	const application = createProductionFactory();
	const tasks = application.backgroundTasks;

	const scheduler = startScheduler(tasks, { runOnStart: true });
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
		await scheduler.stop();
		// `scripts/otel-instrumentation.js` registers its own SIGTERM handler to flush
		// the exporters. Give it room to finish before tearing the process down, or the
		// spans for the tick we just waited on are lost.
		await new Promise((resolve) => setTimeout(resolve, telemetryFlushMs));
		clearTimeout(forced);
		console.log('[worker] stopped');
		process.exit(0);
	};

	process.on('SIGTERM', () => void shutdown('SIGTERM'));
	process.on('SIGINT', () => void shutdown('SIGINT'));
};

main().catch((error) => {
	console.error('[worker] failed to start:', error);
	process.exit(1);
});
