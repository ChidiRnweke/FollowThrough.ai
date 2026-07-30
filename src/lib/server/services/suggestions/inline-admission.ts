export type SuggestionAdmission =
	| { readonly allowed: true }
	| {
			readonly allowed: false;
			readonly reason: 'busy' | 'rate_limited';
			readonly retryAfterMs: number;
	  };

export interface IInlineSuggestionAdmission {
	admit(userId: string): SuggestionAdmission;
	consume(userId: string): SuggestionAdmission;
	release(userId: string): void;
}

const DEFAULT_REQUESTS_PER_MINUTE = 40;
const MINUTE_MS = 60_000;

export interface InlineSuggestionThrottleOptions {
	readonly requestsPerMinute?: number;
	readonly now?: () => number;
}

/** Process-local concurrency and spend guard for proactive completions. */
export class InlineSuggestionAdmission implements IInlineSuggestionAdmission {
	private readonly inFlight = new Set<string>();
	private readonly recent = new Map<string, number[]>();
	private readonly limit: number;
	private readonly now: () => number;

	constructor(options: InlineSuggestionThrottleOptions = {}) {
		this.limit = options.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE;
		this.now = options.now ?? Date.now;
	}

	admit(userId: string) {
		if (this.inFlight.has(userId))
			return { allowed: false as const, reason: 'busy' as const, retryAfterMs: 250 };
		this.inFlight.add(userId);
		return { allowed: true as const };
	}

	consume(userId: string) {
		const now = this.now();
		const window = (this.recent.get(userId) ?? []).filter(
			(timestamp) => now - timestamp < MINUTE_MS
		);
		if (window.length >= this.limit) {
			this.recent.set(userId, window);
			return {
				allowed: false as const,
				reason: 'rate_limited' as const,
				retryAfterMs: Math.max(1, MINUTE_MS - (now - (window[0] ?? now)))
			};
		}
		this.recent.set(userId, [...window, now]);
		return { allowed: true as const };
	}

	release(userId: string): void {
		this.inFlight.delete(userId);
	}
}
