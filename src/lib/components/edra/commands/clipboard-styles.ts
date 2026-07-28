/**
 * Pasting text that brought its own colours.
 *
 * Console output, Google Docs and most web pages carry inline `style` on every span, and
 * TipTap's `TextStyle` matches any `span[style]` at all — so a block of red-and-orange
 * errors pasted into a note stays red and orange, unreadable against a dark theme. The
 * colours were never the point: the text was. Strip decoration before ProseMirror parses
 * the HTML, so it never becomes a mark, while structure (`<h2>`, lists, tables, links) and
 * semantic emphasis (`<strong>`, `<em>`, `<code>`) come through untouched.
 *
 * A copy from this editor is left exactly as it is — ProseMirror tags its own clipboard
 * payload, and a colour the user applied deliberately should survive being moved around.
 */

/** Presentation the source document chose for itself, expressed as CSS. */
const DECORATIVE_PROPERTIES: readonly string[] = [
	'color',
	'background-color',
	'background',
	'font-size',
	'font-family',
	'font-weight',
	'font-style',
	'text-decoration',
	'text-decoration-line',
	'text-decoration-color',
	'text-decoration-style'
];

/** The same, expressed as legacy attributes or as class names that mean nothing here. */
const DECORATIVE_ATTRIBUTES: readonly string[] = ['color', 'bgcolor', 'face', 'size', 'class'];

const stripElement = (element: HTMLElement): void => {
	for (const property of DECORATIVE_PROPERTIES) element.style.removeProperty(property);
	if (!element.style.length) element.removeAttribute('style');
	for (const attribute of DECORATIVE_ATTRIBUTES) element.removeAttribute(attribute);
};

/**
 * Pasted HTML with the source's styling removed, or the input unchanged when it came from
 * this editor or there is no DOM to parse it with.
 */
export const stripPastedStyling = (html: string): string => {
	if (html.includes('data-pm-slice')) return html;
	if (typeof DOMParser === 'undefined') return html;

	const parsed = new DOMParser().parseFromString(html, 'text/html');
	for (const element of parsed.body.querySelectorAll<HTMLElement>('*')) stripElement(element);
	return parsed.body.innerHTML;
};
