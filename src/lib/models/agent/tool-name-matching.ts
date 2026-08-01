export const levenshtein = (a: string, b: string): number => {
	const rows = a.length + 1;
	const cols = b.length + 1;
	let previous = Array.from({ length: cols }, (_, index) => index);
	for (let row = 1; row < rows; row++) {
		const current = [row];
		for (let column = 1; column < cols; column++) {
			const cost = a[row - 1] === b[column - 1] ? 0 : 1;
			current[column] = Math.min(
				current[column - 1]! + 1,
				previous[column]! + 1,
				previous[column - 1]! + cost
			);
		}
		previous = current;
	}
	return previous[cols - 1]!;
};

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

export type ToolNameMatch =
	| { readonly kind: 'exact'; readonly name: string }
	| { readonly kind: 'suggestion'; readonly name: string }
	| { readonly kind: 'none' };

export const matchToolName = (
	query: string,
	names: readonly string[],
	maxDistance = 3
): ToolNameMatch => {
	if (names.includes(query)) return { kind: 'exact', name: query };
	const [best] = suggestToolNames(query, names, maxDistance);
	return best ? { kind: 'suggestion', name: best.name } : { kind: 'none' };
};
