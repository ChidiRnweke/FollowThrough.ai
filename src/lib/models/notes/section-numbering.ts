/**
 * Word-style H1–H4 section numbering, a viewing aid layered over the document:
 * the numbers are drawn by CSS and never enter the ProseMirror content.
 *
 * Three levels decide whether a note's headings are numbered. Each level is
 * tri-state where it can defer: a note inherits the project default, a project
 * inherits the app default, and the app default falls back to off.
 */

/** The value one level of the cascade can take; `undefined` means "inherit". */
export type SectionNumberingSetting = boolean | undefined;

/** The choices the per-document and per-project menus offer. */
export type SectionNumberingLevel = 'on' | 'off' | 'default';

/** What the note workspace needs to render the toggle and the editor. */
export interface SectionNumberingView {
	/** The resolved value after the whole cascade has been applied. */
	readonly effective: boolean;
	/** The note's own override; absent when the note inherits. */
	readonly noteOverride?: boolean;
	/** The project default the note would inherit, itself already resolved against the app default. */
	readonly inherited: boolean;
}

export const resolveSectionNumbering = (
	noteOverride?: boolean,
	projectDefault?: boolean,
	appDefault?: boolean
): boolean => noteOverride ?? projectDefault ?? appDefault ?? false;

export const sectionNumberingView = (
	noteOverride?: boolean,
	projectDefault?: boolean,
	appDefault?: boolean
): SectionNumberingView => ({
	effective: resolveSectionNumbering(noteOverride, projectDefault, appDefault),
	noteOverride,
	inherited: projectDefault ?? appDefault ?? false
});

/** Maps a menu choice to the stored override; 'default' clears it back to inherit. */
export const sectionNumberingOverrideFor = (
	level: SectionNumberingLevel
): SectionNumberingSetting => (level === 'default' ? undefined : level === 'on');

export const sectionNumberingLevelFor = (
	override: SectionNumberingSetting
): SectionNumberingLevel => (override === undefined ? 'default' : override ? 'on' : 'off');

/** Numbering follows the heading ladder the note type scale defines. */
const DEEPEST_NUMBERED_LEVEL = 6;

/**
 * Word-style dotted numbers for a heading sequence, in document order:
 * `[1, 2, 2, 1, 2]` becomes `['1', '1.1', '1.2', '2', '2.1']`.
 *
 * This is the reference the CSS counters must agree with, so two rules are worth
 * stating rather than leaving to the reader:
 *
 * - **A skipped level creates no phantom parents.** An H1 followed by an H3
 *   numbers the H3 `1.1`, not `1.0.1` — depth follows nesting as authored, not
 *   the absolute heading level. A note that opens at H2 therefore starts at `1`.
 * - **Re-entering a depth continues its count.** After `1.1` and `1.2` at H3, an
 *   H2 under the same H1 is `1.3`, not a second `1.1`. Restarting would print the
 *   same number twice in one document.
 */
export const sectionNumbersFor = (levels: readonly number[]): readonly string[] => {
	// The heading level that opened each depth, so a later heading can tell
	// whether it is a sibling of that depth or the start of a deeper one.
	const openedBy: number[] = [];
	const counters: number[] = [];

	return levels.map((raw) => {
		const level = Math.min(Math.max(Math.trunc(raw) || 1, 1), DEEPEST_NUMBERED_LEVEL);
		while (openedBy.length > 0 && level < openedBy[openedBy.length - 1]) openedBy.pop();

		const isSibling = openedBy.length > 0 && level === openedBy[openedBy.length - 1];
		if (!isSibling) openedBy.push(level);

		// `counters` still holds the previous branch's numbers. Longer than the
		// current depth means this depth has been numbered before under the same
		// parent, so continue it; otherwise it is genuinely new.
		if (isSibling || counters.length >= openedBy.length) {
			counters[openedBy.length - 1] += 1;
			counters.length = openedBy.length;
		} else {
			counters.push(1);
		}

		return counters.join('.');
	});
};
