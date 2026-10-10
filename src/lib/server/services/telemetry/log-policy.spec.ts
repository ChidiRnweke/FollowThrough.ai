import { describe, expect, test } from 'vitest';
import type { LogLevel } from '$lib/models/telemetry';
import { TelemetryLogPolicyService } from './log-policy';
const policy = new TelemetryLogPolicyService();
const logLevelEnabled = (level: LogLevel, env: Record<string, string | undefined>) =>
	policy.enabled(level, { LOG_LEVEL: env.LOG_LEVEL, NODE_ENV: env.NODE_ENV });
const summarize = (value: object, maxChars?: number) =>
	policy.summarize(JSON.stringify(value), maxChars);
describe('default log levels', () => {
	test('enables debug outside production and test', () => {
		expect(logLevelEnabled('debug', {})).toBe(true);
	});
	test('suppresses debug in production', () => {
		expect(logLevelEnabled('debug', { NODE_ENV: 'production' })).toBe(false);
	});
	test('accepts a configured override', () => {
		expect(logLevelEnabled('debug', { NODE_ENV: 'production', LOG_LEVEL: 'debug' })).toBe(true);
	});
});
describe('logLevelEnabled', () => {
	test('suppresses debug records when the resolved level is info', () => {
		expect(logLevelEnabled('debug', { LOG_LEVEL: 'info' })).toBe(false);
	});

	test('allows error records at every resolved level', () => {
		expect(logLevelEnabled('error', { LOG_LEVEL: 'error' })).toBe(true);
	});
});

describe('summarize', () => {
	test('elides base64 data URLs', () => {
		const summary = summarize({ image: `data:image/png;base64,${'A'.repeat(2048)}` });

		expect(summary).toContain('<base64 elided');
	});

	test('caps the rendering at maxChars', () => {
		const summary = summarize({ text: 'x'.repeat(1000) }, 100);

		expect(summary.length).toBeLessThanOrEqual(140);
	});
});
