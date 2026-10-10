import type { ProjectId } from '$lib/models/projects';
import type { MemorySuggestionView, SuggestionGroup } from '$lib/models/suggestions';
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

export const groupSuggestionViews = (
	views: readonly SuggestionView[]
): readonly SuggestionGroup[] => {
	const ordered = [...views].sort((a, b) =>
		a.suggestion.createdAt.localeCompare(b.suggestion.createdAt)
	);
	const groups = new Map<string, { note?: SuggestionView['note']; views: SuggestionView[] }>();
	for (const view of ordered) {
		const key = view.note?.id ?? '';
		const group = groups.get(key) ?? { note: view.note, views: [] };
		group.views.push(view);
		groups.set(key, group);
	}
	const result: SuggestionGroup[] = [...groups.values()].map((group) =>
		group.note ? { note: group.note, suggestions: group.views } : { suggestions: group.views }
	);
	return result;
};

export const pendingMemorySuggestions = (
	suggestions: readonly Suggestion[],
	projectId?: ProjectId
): readonly Extract<Suggestion, { kind: 'memory' }>[] =>
	suggestions.filter(
		(suggestion): suggestion is Extract<Suggestion, { kind: 'memory' }> =>
			suggestion.kind === 'memory' && suggestion.payload.projectId === projectId
	);
export const newestMemoryViews = (
	views: readonly SuggestionView[]
): readonly MemorySuggestionView[] =>
	views
		.filter((view): view is MemorySuggestionView => view.suggestion.kind === 'memory')
		.sort((a, b) => b.suggestion.createdAt.localeCompare(a.suggestion.createdAt));
