import type { Suggestion, SuggestionView } from '$lib/models/suggestions';

export function assembleSuggestionView<S extends Suggestion>(
	suggestion: S,
	facts: Omit<SuggestionView, 'suggestion'>
): Omit<SuggestionView, 'suggestion'> & { readonly suggestion: S } {
	return {
		suggestion,
		...(facts.note ? { note: { id: facts.note.id, title: facts.note.title } } : {}),
		...(facts.anchor ? { anchor: facts.anchor } : {}),
		origin: facts.origin
	};
}
