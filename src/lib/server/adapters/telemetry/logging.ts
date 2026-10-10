import type {
	LogLevel,
	TelemetryEnvironment,
	TelemetryLogPolicy,
	TelemetryLogging
} from '$lib/models/telemetry';
export class ProcessTelemetryEnvironment implements TelemetryEnvironment {
	read() {
		return { LOG_LEVEL: process.env.LOG_LEVEL, NODE_ENV: process.env.NODE_ENV };
	}
}
export class TelemetryLogRendering implements TelemetryLogging {
	constructor(
		private readonly policy: TelemetryLogPolicy,
		private readonly environment: TelemetryEnvironment
	) {}
	enabled(level: LogLevel): boolean {
		return this.policy.enabled(level, this.environment.read());
	}
	summarize<T>(value: T, maxChars?: number): string {
		const result = this.render(value);
		return result.kind === 'failure'
			? result.summary
			: this.policy.summarize(result.text, maxChars);
	}
	private render<T>(
		value: T
	): { kind: 'rendered'; text: string } | { kind: 'failure'; summary: string } {
		if (value instanceof Error)
			return { kind: 'rendered', text: `${value.name}: ${value.message}` };
		try {
			return { kind: 'rendered', text: JSON.stringify(value) ?? String(value) };
		} catch {
			return { kind: 'failure', summary: '[unserializable]' };
		}
	}
}
