import { inlineSuggestionSchema, type InlineSuggestion } from '$lib/models/agent';
import type { InlineSuggestionResult } from '$lib/components/edra/commands/InlineSuggestion.js';

const resultOf = (suggestion: InlineSuggestion): InlineSuggestionResult => {
	switch (suggestion.outcome) {
		case 'suggested':
			return { kind: 'offer', edit: { kind: 'insert', text: suggestion.text } };
		case 'no_suggestion':
			return { kind: 'none' };
		case 'rate_limited':
			return { kind: 'retry', afterMs: suggestion.retryAfterMs };
	}
};

/**
 * Decode one ghost-text answer into what the editor can act on.
 *
 * The body is the controller's own result, which the server also sends with a
 * 429 when the writer's per-minute budget is spent; the body carries the wait,
 * so the status alone decides nothing. Anything that does not parse — the
 * provider's 502, a login redirect, an HTML error page — becomes a failure value
 * the editor announces and otherwise drops.
 */
export async function readInlineSuggestionResponse(
	response: Response
): Promise<InlineSuggestionResult> {
	try {
		const parsed = inlineSuggestionSchema.safeParse(await response.json());
		if (!parsed.success)
			return {
				kind: 'failure',
				message: `Writing suggestion failed with status ${response.status}.`
			};
		return resultOf(parsed.data);
	} catch {
		return {
			kind: 'failure',
			message: `Writing suggestion answer could not be read (status ${response.status}).`
		};
	}
}
