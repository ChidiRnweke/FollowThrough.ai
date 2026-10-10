import { expect, it } from 'vitest';
import { createTelemetryCapability } from '$lib/server/factories/telemetry';

it('reports a serialization failure without failing the operation', () => {
	const value: { self?: object } = {};
	value.self = value;
	expect(createTelemetryCapability().logging.summarize(value)).toBe('[unserializable]');
});

it('redacts and truncates error messages with the existing markers', () => {
	const image = `data:image/png;base64,${'A'.repeat(100)}`;
	expect(createTelemetryCapability().logging.summarize(new Error(image), 100)).toBe(
		`Error: ${image.slice(0, 64)}…<base64 elided, 122 chars>`
	);
});

it('reads log configuration for each observation', () => {
	let level = 'info';
	const { logging } = createTelemetryCapability({
		environment: { read: () => ({ LOG_LEVEL: level, NODE_ENV: 'production' }) }
	});
	const before = logging.enabled('debug');
	level = ' DEBUG ';
	expect([before, logging.enabled('debug')]).toEqual([false, true]);
});

it('keeps the test environment threshold when no level is configured', () => {
	const { logging } = createTelemetryCapability({
		environment: { read: () => ({ LOG_LEVEL: undefined, NODE_ENV: 'test' }) }
	});
	expect(
		['debug', 'info', 'warn', 'error'].map((level) =>
			logging.enabled(level as 'debug' | 'info' | 'warn' | 'error')
		)
	).toEqual([false, false, false, true]);
});
