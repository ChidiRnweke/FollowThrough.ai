import type { OutlineHeading, OutlineOffset, OutlineSource } from '$lib/models/notes';

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
