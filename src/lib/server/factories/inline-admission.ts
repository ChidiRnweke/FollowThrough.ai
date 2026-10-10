import type { InlineSuggestionThrottle } from '$lib/models/agent';
import { InlineAdmission } from '$lib/server/controllers/inline-suggestions/admission';
import { InlineAdmissionRules } from '$lib/server/services/inline-suggestions/inline-admission';
import { InlineAdmissionStore } from '$lib/server/stores/inline-suggestions/admission';

export interface InlineSuggestionThrottleOptions {
	readonly requestsPerMinute?: number;
	readonly now?: () => number;
}
export const createInlineAdmission = (
	options: InlineSuggestionThrottleOptions = {}
): InlineSuggestionThrottle =>
	new InlineAdmission(
		new InlineAdmissionRules(options.requestsPerMinute),
		new InlineAdmissionStore(),
		options.now ?? Date.now
	);
