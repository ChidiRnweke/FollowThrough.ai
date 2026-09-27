import { drainBeforeTelemetryShutdown, shutdownTelemetry } from './otel-instrumentation.js';
import { registerWebShutdown } from './web-shutdown.js';

registerWebShutdown(process, {
	waitFor: drainBeforeTelemetryShutdown,
	shutdown: shutdownTelemetry
});

// Register the drain before adapter-node starts accepting requests.
await import('../build/index.js');
