/** Read draw.io label attributes in document order without applying display/search policy. */
const drawioLabelValues = (document: Document): readonly string[] =>
	Array.from(document.querySelectorAll('mxCell, object, UserObject'))
		.flatMap((element) => [element.getAttribute('label'), element.getAttribute('value')])
		.filter((value): value is string => value !== null);

import type { DrawioLabelRead, DrawioLabelSourceReader } from '$lib/models/diagrams/drawio-labels';

const decodeHtml = (html: string): string => {
	// draw.io labels are rich text, so `<b>Browser</b>` is an ordinary value.
	const holder = document.createElement('div');
	holder.innerHTML = html;
	return holder.textContent ?? '';
};

export class BrowserDrawioLabelReader implements DrawioLabelSourceReader {
	read(source: string): DrawioLabelRead {
		const parsed = new DOMParser().parseFromString(source, 'text/xml');
		// `DOMParser` reports a failure as a document rather than by throwing, so the
		// error element is the only signal that the source was not XML at all.
		if (parsed.querySelector('parsererror')) return { kind: 'unreadable' };
		return {
			kind: 'labels',
			labels: drawioLabelValues(parsed).map(decodeHtml)
		};
	}
}
