/**
 * One process shutdown: finish application work before closing its exporters.
 * The preload and application signal handlers share the same pending shutdown;
 * a process whose start failed abandons it instead, since nothing will drain.
 * @param {() => Promise<void>} stopTelemetry
 */
export function createTelemetryShutdown(stopTelemetry) {
	/** @type {(() => Promise<void>) | undefined} */
	let drain;
	/** @type {Promise<void> | undefined} */
	let stopping;
	return {
		/** @param {() => Promise<void>} work */
		waitFor(work) {
			if (stopping) throw new Error('Telemetry shutdown has already started');
			if (drain) throw new Error('Application shutdown is already registered');
			drain = work;
		},
		shutdown() {
			stopping ??= (async () => {
				try {
					if (drain) await drain();
				} finally {
					await stopTelemetry();
				}
			})();
			return stopping;
		},
		/** Stop without draining: the process failed before its work started. */
		abandon() {
			stopping ??= stopTelemetry();
			return stopping;
		}
	};
}
