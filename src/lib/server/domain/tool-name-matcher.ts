/**
 * Verbatim-with-fallback tool-name resolution for the `use_tool` dispatcher.
 * An exact name wins; otherwise every name within an edit-distance threshold
 * can be offered as a "did you mean" suggestion — never executed, so the model
 * corrects itself rather than a guessed tool running.
 */

export const levenshtein = (a: string, b: string): number => {
	const rows = a.length + 1;
	const cols = b.length + 1;
	let previous = Array.from({ length: cols }, (_, i) => i);
	for (let i = 1; i < rows; i++) {
		const current = [i];
		for (let j = 1; j < cols; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
		}
		previous = current;
	}
	return previous[cols - 1]!;
};

export type ToolNameMatch =
	| { readonly kind: 'exact'; readonly name: string }
	| { readonly kind: 'suggestion'; readonly name: string }
	| { readonly kind: 'none' };

export interface ToolNameSuggestion {
	readonly name: string;
	readonly distance: number;
}

export const suggestToolNames = (
	query: string,
	names: readonly string[],
	maxDistance = 3
): readonly ToolNameSuggestion[] =>
	[...new Set(names)]
		.map((name) => ({ name, distance: levenshtein(query, name) }))
		.filter((suggestion) => suggestion.distance <= maxDistance)
		.sort(
			(left, right) =>
				left.distance - right.distance ||
				(left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
		);

export const matchToolName = (
	query: string,
	names: readonly string[],
	maxDistance = 3
): ToolNameMatch => {
	if (names.includes(query)) return { kind: 'exact', name: query };
	const [best] = suggestToolNames(query, names, maxDistance);
	if (best) return { kind: 'suggestion', name: best.name };
	return { kind: 'none' };
};
