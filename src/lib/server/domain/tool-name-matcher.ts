/**
 * Verbatim-with-fallback tool-name resolution for the `use_tool` dispatcher.
 * An exact name wins; otherwise the nearest name within an edit-distance
 * threshold is offered as a "did you mean" suggestion — never executed, so the
 * model corrects itself rather than a guessed tool running.
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

export const matchToolName = (
	query: string,
	names: readonly string[],
	maxDistance = 3
): ToolNameMatch => {
	if (names.includes(query)) return { kind: 'exact', name: query };
	let best: string | undefined;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const name of names) {
		const distance = levenshtein(query, name);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = name;
		}
	}
	if (best !== undefined && bestDistance <= maxDistance) return { kind: 'suggestion', name: best };
	return { kind: 'none' };
};
