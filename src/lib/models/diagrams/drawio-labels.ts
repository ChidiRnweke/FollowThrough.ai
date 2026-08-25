/**
 * The words a draw.io diagram actually shows.
 *
 * A diagram's XML is thousands of tokens of geometry and styling wrapped around a
 * few dozen labels. Those labels are the only part a person recognises, so they
 * are what a search indexes and what an approval card can show instead of markup.
 *
 * The walk lives here because two callers need it and they parse differently: the
 * server has jsdom, the browser has `DOMParser`. Both hand in a parsed document
 * and a way to turn a rich-text label into plain text — draw.io labels come from
 * an HTML editor, so `<b>Browser</b>` is an ordinary value. Injecting the decoder
 * keeps the part that varies at the edges and the part that does not right here.
 */
export type HtmlTextDecoder = (html: string) => string;

/** Elements draw.io hangs a label on. `mxCell` covers most; the other two carry rich text. */
const LABELLED = 'mxCell, object, UserObject';

export const drawioLabels = (
	document: Document,
	decodeHtml: HtmlTextDecoder
): readonly string[] => {
	const labels = Array.from(document.querySelectorAll(LABELLED))
		.flatMap((element) => [element.getAttribute('label'), element.getAttribute('value')])
		.filter((value): value is string => Boolean(value?.trim()))
		.map((value) => decodeHtml(value).replace(/\s+/g, ' ').trim())
		.filter(Boolean);
	// Deduplicated: one label repeated on twenty cells says the same thing once.
	return [...new Set(labels)];
};

/** What an edit does to a diagram's labels, as the approval card reports it. */
export interface DrawioLabelDiff {
	readonly added: readonly string[];
	readonly removed: readonly string[];
	/** How many labels neither side touched, so the card can say the change is small. */
	readonly kept: number;
}

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
