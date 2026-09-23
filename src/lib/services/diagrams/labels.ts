import type { DrawioLabelDiff } from '$lib/models/diagrams/drawio-labels';

/** Search and review use visible words once, in document order. */
export const normalizedDrawioLabels = (decoded: readonly string[]): readonly string[] => [
	...new Set(decoded.map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean))
];

export const searchableDrawioText = (decoded: readonly string[]): string =>
	normalizedDrawioLabels(decoded).join('\n');

export const drawioLabelDiff = (
	before: readonly string[],
	after: readonly string[]
): DrawioLabelDiff => {
	const had = new Set(before);
	const has = new Set(after);
	return {
		added: after.filter((label) => !had.has(label)),
		removed: before.filter((label) => !has.has(label)),
		kept: after.filter((label) => had.has(label)).length
	};
};
