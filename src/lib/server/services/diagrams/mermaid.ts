import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { runInContext, Script } from 'node:vm';
import { JSDOM } from 'jsdom';
import { ValidationError } from '$lib/errors';

const require = createRequire(import.meta.url);

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
/** Every Mermaid source operation, for a controller that validates, renders and indexes it. */
export interface MermaidDocuments
	extends MermaidSourceValidator, MermaidDiagramRenderer, DiagramTextExtractor {}

/** Mermaid source: submission validation, a rendered preview and searchable text. */
export class MermaidDocumentService implements MermaidDocuments {
	validate(source: string): Promise<void> {
		return validateMermaid(source);
	}
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

export interface MermaidSourceValidator {
	validate(source: string): Promise<void>;
}

/** Rejects unsafe Mermaid constructs, then parses the source with Mermaid's own parser. */
const validateMermaid = async (source: string): Promise<void> => {
	if (source.includes('```'))
		throw new ValidationError('Submit Mermaid source without code fences.');
	if (/%%\s*\{/i.test(source))
		throw new ValidationError(
			'Mermaid initialization and configuration directives are not allowed.'
		);
	if (/^\s*(?:click|href)\s+/im.test(source) || /javascript:/i.test(source))
		throw new ValidationError('Links and click handlers are not allowed in Mermaid diagrams.');
	if (/<\/?[a-z][^>]*>/i.test(source))
		throw new ValidationError(
			'HTML labels are not allowed in Mermaid diagrams. Use escaped \\n inside quoted labels instead.'
		);
	const failure = await mermaidParseFailure(source);
	if (failure !== undefined) throw new ValidationError(`Invalid Mermaid syntax: ${failure}`);
};

/**
 * Mermaid's sanitizer binds to a DOM window when it loads, so the browser bundle runs as a
 * script inside a private jsdom window. The server's own globals never gain a `window`.
 * Returns Mermaid's message for invalid source.
 */
async function mermaidParseFailure(source: string): Promise<string | undefined> {
	const bundle = new Script(await readFile(require.resolve('mermaid/dist/mermaid.min.js'), 'utf8'));
	const dom = new JSDOM('', { runScripts: 'outside-only' });
	try {
		const context = dom.getInternalVMContext();
		bundle.runInContext(context);
		const parse: (text: string) => Promise<string | undefined> = runInContext(
			'(text) => mermaid.parse(text).then(() => undefined, (error) => String(error?.message ?? error))',
			context
		);
		return await parse(source);
	} finally {
		dom.window.close();
	}
}
