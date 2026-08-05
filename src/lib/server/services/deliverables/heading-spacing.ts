/**
 * Vertical spacing around a heading in an exported document, mirroring the
 * editor's double-spaced titles.
 *
 * The editor gives a title a full blank line's worth of space below it — an h1
 * more than an h2 — so a heading never reads as glued to the body text beneath.
 * Exports carry the same rhythm. Values are in points; a DOCX generator converts
 * them to twips. Deeper headings keep the tight rhythm and return `undefined`,
 * so each generator falls back to its own previous behaviour for them.
 */
export function headingSpacingPt(level: number): { before: number; after: number } | undefined {
	switch (level) {
		case 1:
			return { before: 18, after: 18 };
		case 2:
			return { before: 15, after: 15 };
		default:
			return undefined;
	}
}
