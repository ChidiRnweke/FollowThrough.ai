import type { DrawioLabelDiff } from '$lib/models/diagrams/drawio-labels';

/** Search and review use visible words once, in document order. */
const normalizedDrawioLabels = (decoded: readonly string[]): readonly string[] => [
	...new Set(decoded.map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean))
];

const searchableDrawioText = (decoded: readonly string[]): string =>
	normalizedDrawioLabels(decoded).join('\n');

const drawioLabelDiff = (before: readonly string[], after: readonly string[]): DrawioLabelDiff => {
	const had = new Set(before);
	const has = new Set(after);
	return {
		added: after.filter((label) => !had.has(label)),
		removed: before.filter((label) => !has.has(label)),
		kept: after.filter((label) => had.has(label)).length
	};
};

export interface DiagramLabelPresentation {
	labels(decoded: readonly string[]): readonly string[];
	searchText(decoded: readonly string[]): string;
	compare(before: readonly string[], after: readonly string[]): DrawioLabelDiff;
}
export class DiagramLabelPresentationService implements DiagramLabelPresentation {
	labels(decoded: readonly string[]): readonly string[] {
		return normalizedDrawioLabels(decoded);
	}
	searchText(decoded: readonly string[]): string {
		return searchableDrawioText(decoded);
	}
	compare(before: readonly string[], after: readonly string[]): DrawioLabelDiff {
		return drawioLabelDiff(before, after);
	}
}
