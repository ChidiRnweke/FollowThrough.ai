/**
 * The note outline: the heading structure a document exposes, plus the maths for
 * deciding which section the reader is currently in.
 *
 * The scroll comparison lives here rather than in the editor because the TipTap
 * table-of-contents extension gets it wrong for this app. It compares against
 * `offsetTop`, which is measured from the nearest positioned ancestor — the
 * absolutely positioned workspace pane layer — instead of the scrollport, and it
 * has no idea the note header is sticky. Owning the comparison keeps it honest
 * and, being pure, keeps it testable.
 */

/** One heading, as the rail renders it. */
export interface OutlineHeading {
	readonly id: string;
	readonly level: number;
	readonly text: string;
}

/** A heading's top edge, in the scroll container's coordinate space. */
export interface OutlineOffset {
	readonly id: string;
	readonly top: number;
}

/**
 * Structurally what the table-of-contents extension emits. Declared here so the
 * model stays free of editor imports.
 */
export interface OutlineSource {
	readonly id?: string | null;
	readonly level: number;
	readonly textContent: string;
}

/** Headings deep enough to be worth a tick mark; beyond this the rail turns to noise. */
const DEEPEST_OUTLINE_LEVEL = 6;

/**
 * The rail's view of the document, in document order. Headings with no text are
 * dropped: an empty heading is a line the author is still typing, and it would
 * render as an unlabelled entry that jumps somewhere blank.
 */
export const outlineFrom = (items: readonly OutlineSource[]): readonly OutlineHeading[] =>
	items.flatMap((item) => {
		const text = item.textContent.trim();
		if (!item.id || text.length === 0) return [];
		return [{ id: item.id, level: clampLevel(item.level), text }];
	});

const clampLevel = (level: number): number =>
	Math.min(Math.max(Math.trunc(level) || 1, 1), DEEPEST_OUTLINE_LEVEL);

/**
 * The section the reader is in: the last heading whose top has crossed `line`.
 *
 * Before any heading has crossed, the first one still owns the view — a
 * document's preamble reads as part of its opening section, and a rail with
 * nothing lit reads as broken rather than as "above the first heading".
 */
export const activeHeadingAt = (
	offsets: readonly OutlineOffset[],
	line: number
): string | undefined => {
	let active = offsets[0]?.id;
	for (const { id, top } of offsets) {
		if (top > line) break;
		active = id;
	}
	return active;
};
