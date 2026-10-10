import type { LogLevel, LogEnvironment } from '$lib/models/telemetry';
export interface TelemetryLogPolicy {
	enabled(level: LogLevel, environment: LogEnvironment): boolean;
	summarize(rendered: string, maxChars?: number): string;
}
const LOG_LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const BASE64_DATA_URL = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;
/** Rules operate on rendered text; arbitrary values are serialized by the adapter. */
export class TelemetryLogPolicyService implements TelemetryLogPolicy {
	enabled(level: LogLevel, environment: LogEnvironment): boolean {
		return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.resolve(environment)];
	}
	private resolve(env: LogEnvironment): LogLevel {
		const configured = env.LOG_LEVEL?.trim().toLowerCase();
		if (
			configured === 'debug' ||
			configured === 'info' ||
			configured === 'warn' ||
			configured === 'error'
		)
			return configured;
		if (env.NODE_ENV === 'production') return 'info';
		if (env.NODE_ENV === 'test') return 'error';
		return 'debug';
	}
	summarize(rendered: string, maxChars = 500): string {
		rendered = rendered.replace(
			BASE64_DATA_URL,
			(match) => `${match.slice(0, 64)}…<base64 elided, ${match.length} chars>`
		);
		if (rendered.length > maxChars)
			return `${rendered.slice(0, maxChars)}…<truncated, ${rendered.length} chars>`;
		return rendered;
	}
}
