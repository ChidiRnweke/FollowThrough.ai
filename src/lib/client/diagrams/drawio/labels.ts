/** Read draw.io label attributes in document order without applying display/search policy. */
const drawioLabelValues = (document: Document): readonly string[] =>
	Array.from(document.querySelectorAll('mxCell, object, UserObject'))
		.flatMap((element) => [element.getAttribute('label'), element.getAttribute('value')])
		.filter((value): value is string => value !== null);

import { normalizedDrawioLabels } from '$lib/services/diagrams/labels';

/**
 * The labels in a draw.io document, read in the browser.
 *
 * The browser reads XML with `DOMParser`; the server uses jsdom. The
 * approval card uses it to say what a diagram contains without rendering it —
 * the server cannot draw draw.io, and a card that waited for a picture would
 * show nothing at the moment the user is deciding.
 */
export type DrawioLabelRead =
	| { readonly kind: 'labels'; readonly labels: readonly string[] }
	/** The source did not parse. The card says so rather than showing an empty diagram. */
	| { readonly kind: 'unreadable' };

const decodeHtml = (html: string): string => {
	// draw.io labels are rich text, so `<b>Browser</b>` is an ordinary value.
	const holder = document.createElement('div');
	holder.innerHTML = html;
	return holder.textContent ?? '';
};

export const readDrawioLabels = (source: string): DrawioLabelRead => {
	const parsed = new DOMParser().parseFromString(source, 'text/xml');
	// `DOMParser` reports a failure as a document rather than by throwing, so the
	// error element is the only signal that the source was not XML at all.
	if (parsed.querySelector('parsererror')) return { kind: 'unreadable' };
	return {
		kind: 'labels',
		labels: normalizedDrawioLabels(drawioLabelValues(parsed).map(decodeHtml))
	};
};
