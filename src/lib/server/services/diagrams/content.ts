import { ValidationError } from '$lib/errors';
const escapeXml = (value: string): string =>
	value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export interface MermaidDiagramRenderer {
	render(source: string): Promise<string>;
}
export interface DiagramTextExtractor {
	/**
	 * Takes the source rather than a whole `Diagram`, because the source is all
	 * any extractor reads. Callers that have only just built a source — the studio
	 * keep path — would otherwise have to assert a `Diagram` they do not have.
	 */
	extract(diagram: DiagramSource): Promise<string>;
}
export interface DiagramSource {
	readonly source: string;
}
export class DiagramContent implements MermaidDiagramRenderer, DiagramTextExtractor {
	async render(source: string): Promise<string> {
		if (!/^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram)/m.test(source))
			throw new ValidationError('Generated Mermaid is invalid');
		return `<svg xmlns="http://www.w3.org/2000/svg" role="img"><text x="8" y="20">${escapeXml(source)}</text></svg>`;
	}
	async extract(diagram: { readonly source: string }): Promise<string> {
		return diagram.source
			.replace(/<[^>]+>/g, ' ')
			.replace(/[^a-z0-9 _.-]+/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}
}
