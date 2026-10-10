import type { InlineSuggestionAdmission } from '$lib/models/agent';

export interface IInlineAdmissionRules {
	admit(inFlight: boolean): InlineSuggestionAdmission;
	consume(
		recent: readonly number[],
		now: number
	): { readonly admission: InlineSuggestionAdmission; readonly recent: readonly number[] };
}

/** Existing proactive-completion policy; the controller owns per-user state. */
export class InlineAdmissionRules implements IInlineAdmissionRules {
	constructor(private readonly requestsPerMinute = 40) {}
	admit(inFlight: boolean): InlineSuggestionAdmission {
		return inFlight ? { allowed: false, reason: 'busy', retryAfterMs: 250 } : { allowed: true };
	}
	consume(
		recent: readonly number[],
		now: number
	): { readonly admission: InlineSuggestionAdmission; readonly recent: readonly number[] } {
		const window = recent.filter((timestamp) => now - timestamp < 60_000);
		if (window.length >= this.requestsPerMinute)
			return {
				admission: {
					allowed: false,
					reason: 'rate_limited',
					retryAfterMs: Math.max(1, 60_000 - (now - (window[0] ?? now)))
				},
				recent: window
			};
		return { admission: { allowed: true }, recent: [...window, now] };
	}
}
