/**
 * adapter-node emits sveltekit:shutdown after it closes active HTTP connections.
 * SIGTERM waits on that event; SIGINT and idle shutdown initiate the same flush there.
 * @param {import('node:events').EventEmitter} events
 * @param {{ waitFor: (drain: () => Promise<void>) => void; shutdown: () => Promise<void> }} telemetry
 */
export function registerWebShutdown(events, telemetry) {
	const drained = new Promise((resolve) => events.once('sveltekit:shutdown', resolve));
	telemetry.waitFor(async () => {
		await drained;
	});
	events.once('sveltekit:shutdown', () => {
		void telemetry.shutdown();
	});
}
