import type { InlineSuggestionAdmission, InlineSuggestionThrottle } from '$lib/models/agent';
import type { IInlineAdmissionRules } from '$lib/server/services/inline-suggestions/inline-admission';
import type { InlineAdmissionStore } from '$lib/server/stores/inline-suggestions/admission';

/** Admission and reservation happen synchronously, before the caller can await provider work. */
export class InlineAdmission implements InlineSuggestionThrottle {
	constructor(
		private readonly rules: IInlineAdmissionRules,
		private readonly store: InlineAdmissionStore,
		private readonly now: () => number
	) {}
	admit(userId: string): InlineSuggestionAdmission {
		const result = this.rules.admit(this.store.hasRequest(userId));
		if (result.allowed) this.store.register(userId);
		return result;
	}
	consume(userId: string): InlineSuggestionAdmission {
		const result = this.rules.consume(this.store.recent(userId), this.now());
		this.store.replaceRecent(userId, result.recent);
		return result.admission;
	}
	release(userId: string): void {
		this.store.release(userId);
	}
}
