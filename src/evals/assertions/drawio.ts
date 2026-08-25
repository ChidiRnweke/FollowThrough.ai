import { JSDOM } from 'jsdom';
import { DrawioXmlValidator } from '$lib/server/services/diagrams/drawio';

export interface DrawioEdge {
	readonly source: string;
	readonly target: string;
	readonly label: string;
}

export type DrawioInspection =
	| {
			readonly kind: 'valid';
			readonly labels: readonly string[];
			readonly edges: readonly DrawioEdge[];
	  }
	| { readonly kind: 'failure'; readonly reason: string };

const textOf = (html: Document, value: string | null): string => {
	if (!value) return '';
	html.body.innerHTML = value;
	return (html.body.textContent ?? '').replace(/\s+/g, ' ').trim();
};

/** Inspect semantics only after the production boundary accepts the editable document. */
export const inspectDrawio = (source: string): DrawioInspection => {
	try {
		const validated = new DrawioXmlValidator().validate(source);
		const xml = new JSDOM(validated, { contentType: 'text/xml' });
		const html = new JSDOM('').window.document;
		try {
			const labelsById = new Map<string, string>();
			for (const element of Array.from(
				xml.window.document.querySelectorAll('mxCell, object, UserObject')
			)) {
				const id = element.getAttribute('id');
				if (!id) continue;
				const label = textOf(html, element.getAttribute('label') ?? element.getAttribute('value'));
				if (label) labelsById.set(id, label);
			}
			const edges = Array.from(xml.window.document.querySelectorAll('mxCell[edge="1"]')).map(
				(edge) => ({
					source: labelsById.get(edge.getAttribute('source') ?? '') ?? '',
					target: labelsById.get(edge.getAttribute('target') ?? '') ?? '',
					label: textOf(html, edge.getAttribute('value'))
				})
			);
			return { kind: 'valid', labels: [...new Set(labelsById.values())], edges };
		} finally {
			xml.window.close();
			html.defaultView?.close();
		}
	} catch (error) {
		return { kind: 'failure', reason: error instanceof Error ? error.message : String(error) };
	}
};
