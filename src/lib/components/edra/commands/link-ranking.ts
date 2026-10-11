/**
 * Rank link targets for a query.
 *
 * Pure, so the ordering is testable without an editor. A prefix match outranks a
 * word-start match, which outranks a match anywhere. Equal matches fall back to
 * `tieBreak`, then to alphabetical order of the label. An empty query keeps the
 * input order.
 */
export const rankLinkTargets = <Target>(
	targets: readonly Target[],
	query: string,
	label: (target: Target) => string,
	tieBreak: (a: Target, b: Target) => number,
	limit: number
): readonly Target[] => {
	const needle = query.trim().toLowerCase();
	if (!needle) return targets.slice(0, limit);

	const scored: { target: Target; text: string; score: number }[] = [];
	for (const target of targets) {
		const text = label(target);
		const lower = text.toLowerCase();
		const at = lower.indexOf(needle);
		if (at === -1) continue;
		const startsWord = at === 0 || /[\s\-_/]/.test(lower[at - 1] ?? '');
		scored.push({ target, text, score: at === 0 ? 0 : startsWord ? 1 : 2 });
	}
	return scored
		.sort(
			(a, b) => a.score - b.score || tieBreak(a.target, b.target) || a.text.localeCompare(b.text)
		)
		.slice(0, limit)
		.map((entry) => entry.target);
};
