import createDOMPurify from 'dompurify';
import type { WindowLike } from 'dompurify';
import { JSDOM } from 'jsdom';
import { ValidationError } from '$lib/errors';
import { drawioLabels } from '$lib/models/diagrams/drawio-labels';

export interface IDiagramContent {
	extract(diagram: { readonly source: string }): Promise<string>;
}

const MAX_DRAWIO_SOURCE_LENGTH = 2_000_000;
const MAX_SVG_LENGTH = 2_000_000;
const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href']);
const REFERENCE_ATTRIBUTES = ['parent', 'source', 'target'] as const;
const GEOMETRY_ATTRIBUTES = ['x', 'y', 'width', 'height'] as const;

const elementChildren = (element: Element): Element[] => Array.from(element.children) as Element[];

const directChildrenNamed = (element: Element, name: string): Element[] =>
	elementChildren(element).filter((child) => child.nodeName === name);

const unsafeUrl = (value: string): boolean => {
	const normalized = Array.from(value.trim())
		.filter((character) => character.charCodeAt(0) > 32)
		.join('')
		.toLowerCase();
	if (!normalized || normalized.startsWith('#')) return false;
	return !normalized.startsWith('https://');
};

/**
 * One HTML document, kept only to borrow its entity table.
 *
 * Created lazily so a process that never parses a diagram never builds it.
 */
let entityDecoder: Document | undefined;

const decodeNamedEntity = (entity: string): string | undefined => {
	entityDecoder ??= new JSDOM('').window.document;
	const holder = entityDecoder.createElement('div');
	holder.innerHTML = entity;
	const decoded = holder.textContent ?? '';
	return decoded === entity ? undefined : decoded;
};

/** The five references XML defines itself; everything else is an HTML name. */
const XML_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);

/**
 * Rewrite HTML named entities as numeric character references.
 *
 * draw.io labels come from a rich-text editor, so `&nbsp;` and friends appear in
 * ordinary diagrams — and an XML parser, which knows only the five XML entities,
 * rejects the whole document with "undefined entity". Rewriting to `&#160;` keeps
 * the character and makes the document parseable.
 *
 * Numeric references rather than the literal character on purpose: a numeric
 * reference can never re-introduce markup, so this cannot smuggle a `<` past the
 * checks that run after parsing. A name with no HTML meaning is left untouched
 * and still fails the parse, which is the honest answer for it.
 */
const normalizeEntities = (source: string): string =>
	source.replace(/&([A-Za-z][A-Za-z0-9]{1,31});/g, (match, name: string) => {
		if (XML_ENTITIES.has(name.toLowerCase())) return match;
		const decoded = decodeNamedEntity(match);
		if (decoded === undefined) return match;
		return Array.from(decoded)
			.map((character) => `&#${character.codePointAt(0)};`)
			.join('');
	});

/**
 * A document whose markup arrived as character references rather than markup.
 *
 * A model that HTML-escapes its own output sends `&lt;mxfile&gt;…`, which is a
 * well-formed *text node* and nothing else, so the parser answers
 * "text data outside of root node" at 1:1 — true, and useless to whoever has to
 * fix it. `normalizeEntities` cannot help: `lt` is one of the five references
 * XML defines, so it is deliberately left alone.
 *
 * Detected by absence: real draw.io XML opens with a literal `<`, and no amount
 * of escaped content inside labels changes that.
 */
const isEscapedMarkup = (source: string): boolean =>
	!source.includes('<') && /&(?:lt|#0*60|#x0*3c);/i.test(source);

const parseXml = (source: string, label: string): JSDOM => {
	try {
		return new JSDOM(normalizeEntities(source), { contentType: 'text/xml' });
	} catch (error) {
		throw new ValidationError(
			`${label} is malformed: ${error instanceof Error ? error.message : String(error)}`
		);
	}
};

const assertSafeAttributes = (document: Document): void => {
	for (const element of Array.from(document.querySelectorAll('*'))) {
		if (element.nodeName.toLowerCase() === 'script')
			throw new ValidationError('draw.io XML cannot contain scripts.');
		for (const attribute of Array.from(element.attributes)) {
			const name = attribute.name.toLowerCase();
			const value = attribute.value;
			if (name.startsWith('on'))
				throw new ValidationError('draw.io XML cannot contain event handlers.');
			if (/<\s*script\b/i.test(value))
				throw new ValidationError('draw.io XML cannot contain scripts.');
			if (/\bon[a-z]+\s*=/i.test(value))
				throw new ValidationError('draw.io XML cannot contain event handlers.');
			if (URL_ATTRIBUTES.has(name) && unsafeUrl(value))
				throw new ValidationError('draw.io XML contains an unsafe URL.');
			if (/\b(?:javascript|vbscript|data)\s*:/i.test(value))
				throw new ValidationError('draw.io XML contains an unsafe URL.');
			if (/(?:url\s*\(|@import|expression\s*\()/i.test(value))
				throw new ValidationError('draw.io XML contains an unsafe style.');
		}
	}
};

const assertGraphReferences = (model: Element): void => {
	const cells = Array.from(model.querySelectorAll('mxCell'));
	const ids = new Set<string>();
	for (const cell of cells) {
		const id = cell.getAttribute('id')?.trim();
		if (!id) throw new ValidationError('Every draw.io cell requires an id.');
		if (ids.has(id)) throw new ValidationError(`Duplicate draw.io cell id: ${id}`);
		ids.add(id);
	}
	if (!ids.has('0') || !ids.has('1'))
		throw new ValidationError('draw.io XML requires root cells 0 and 1.');
	for (const cell of cells) {
		for (const attribute of REFERENCE_ATTRIBUTES) {
			const reference = cell.getAttribute(attribute)?.trim();
			if (reference && !ids.has(reference))
				throw new ValidationError(`draw.io cell has an invalid ${attribute} reference.`);
		}
	}
};

const assertFiniteGeometry = (model: Element): void => {
	for (const geometry of Array.from(model.querySelectorAll('mxGeometry, mxPoint, mxRectangle'))) {
		for (const attribute of GEOMETRY_ATTRIBUTES) {
			const raw = geometry.getAttribute(attribute);
			if (raw === null) continue;
			if (!raw.trim() || !Number.isFinite(Number(raw)))
				throw new ValidationError(`draw.io geometry ${attribute} must be finite.`);
		}
	}
};

export class DrawioXmlValidator {
	validate(source: string): string {
		const normalized = source.trim();
		if (!normalized) throw new ValidationError('draw.io XML is required.');
		if (normalized.length > MAX_DRAWIO_SOURCE_LENGTH)
			throw new ValidationError('draw.io XML is too large.');
		// Checked before parsing so the answer names the mistake. Deliberately not
		// unescaped and retried: that would repair a document nobody verified, and
		// `assertSafeAttributes` below relies on escaped values staying escaped.
		if (isEscapedMarkup(normalized))
			throw new ValidationError(
				'draw.io XML is HTML-escaped: the source begins with "&lt;" rather than "<". Send the raw XML, escaping only inside attribute values.'
			);
		if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(normalized))
			throw new ValidationError('draw.io XML cannot contain declarations or entities.');

		const dom = parseXml(normalized, 'draw.io XML');
		try {
			const document = dom.window.document;
			const mxfile = document.documentElement;
			if (mxfile.nodeName !== 'mxfile')
				throw new ValidationError('draw.io XML must have an mxfile root.');
			const diagrams = directChildrenNamed(mxfile, 'diagram');
			if (!diagrams.length) throw new ValidationError('draw.io XML requires a diagram.');
			for (const diagram of diagrams) {
				const models = directChildrenNamed(diagram, 'mxGraphModel');
				if (models.length !== 1)
					throw new ValidationError('Each draw.io diagram requires one uncompressed mxGraphModel.');
				const roots = directChildrenNamed(models[0]!, 'root');
				if (roots.length !== 1) throw new ValidationError('draw.io XML requires a graph root.');
				assertGraphReferences(models[0]!);
				assertFiniteGeometry(models[0]!);
			}
			assertSafeAttributes(document);
			return normalized;
		} finally {
			dom.window.close();
		}
	}
}

const safeSvgUrl = (value: string): boolean => value.trim().startsWith('#');

const purifierWindow = (window: JSDOM['window']): WindowLike => ({
	DocumentFragment: window.DocumentFragment,
	HTMLTemplateElement: window.HTMLTemplateElement,
	Node: window.Node,
	Element: window.Element,
	NodeFilter: window.NodeFilter,
	NamedNodeMap: window.NamedNodeMap,
	HTMLFormElement: window.HTMLFormElement,
	DOMParser: window.DOMParser,
	document: window.document,
	trustedTypes: window.trustedTypes
});

export class DrawioSvgSanitizer {
	sanitize(source: string): string {
		const normalized = source.trim();
		if (!normalized) throw new ValidationError('A draw.io SVG preview is required.');
		if (normalized.length > MAX_SVG_LENGTH)
			throw new ValidationError('The draw.io SVG preview is too large.');

		const window = new JSDOM('').window;
		try {
			const purifier = createDOMPurify(purifierWindow(window));
			const sanitized = purifier.sanitize(normalized, {
				USE_PROFILES: { svg: true, svgFilters: true },
				FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed', 'style'],
				FORBID_ATTR: ['onload', 'onclick', 'onerror', 'onbegin', 'onend']
			});
			const svgDom = parseXml(String(sanitized), 'SVG preview');
			try {
				const document = svgDom.window.document;
				if (document.documentElement.nodeName.toLowerCase() !== 'svg')
					throw new ValidationError('The preview must be an SVG document.');
				for (const element of Array.from(document.querySelectorAll('*'))) {
					for (const attribute of Array.from(element.attributes)) {
						const name = attribute.name.toLowerCase();
						const value = attribute.value;
						if (name.startsWith('on')) element.removeAttribute(attribute.name);
						else if (URL_ATTRIBUTES.has(name) && !safeSvgUrl(value))
							element.removeAttribute(attribute.name);
						else if (
							/\b(?:javascript|vbscript|data)\s*:/i.test(value) ||
							/url\s*\(\s*['"]?(?!#)/i.test(value) ||
							/@import|expression\s*\(/i.test(value)
						)
							element.removeAttribute(attribute.name);
					}
				}
				return document.documentElement.outerHTML;
			} finally {
				svgDom.window.close();
			}
		} finally {
			window.close();
		}
	}
}

export class DrawioLabelExtractor {
	/** The labels themselves, which the approval card shows and `extract` joins. */
	read(source: string): readonly string[] {
		const xmlDom = parseXml(source, 'draw.io XML');
		const htmlDom = new JSDOM('');
		try {
			const body = htmlDom.window.document.body;
			// draw.io labels come from a rich-text editor, so the value is HTML. The
			// walk is shared with the browser; only this decoding differs.
			return drawioLabels(xmlDom.window.document, (html) => {
				body.textContent = '';
				body.innerHTML = html;
				return body.textContent ?? '';
			});
		} finally {
			xmlDom.window.close();
			htmlDom.window.close();
		}
	}

	extract(source: string): string {
		return this.read(source).join('\n');
	}
}

export class DrawioDiagramTextExtractor implements IDiagramContent {
	private readonly labels = new DrawioLabelExtractor();

	async extract(diagram: { readonly source: string }): Promise<string> {
		return this.labels.extract(diagram.source);
	}
}
