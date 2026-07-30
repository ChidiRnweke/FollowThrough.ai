import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import type { Diagram } from '$lib/models';
import { ValidationError } from '$lib/errors';

export interface IDiagramContent {
	extract(diagram: Diagram): Promise<string>;
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

const parseXml = (source: string, label: string): JSDOM => {
	try {
		return new JSDOM(source, { contentType: 'text/xml' });
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

export class DrawioSvgSanitizer {
	sanitize(source: string): string {
		const normalized = source.trim();
		if (!normalized) throw new ValidationError('A draw.io SVG preview is required.');
		if (normalized.length > MAX_SVG_LENGTH)
			throw new ValidationError('The draw.io SVG preview is too large.');

		const window = new JSDOM('').window;
		try {
			const purifier = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);
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
	extract(source: string): string {
		const xmlDom = parseXml(source, 'draw.io XML');
		const htmlDom = new JSDOM('');
		try {
			const body = htmlDom.window.document.body;
			const labels = Array.from(
				xmlDom.window.document.querySelectorAll('mxCell, object, UserObject')
			)
				.flatMap((element) => [element.getAttribute('label'), element.getAttribute('value')])
				.filter((value): value is string => Boolean(value?.trim()))
				.map((value) => {
					body.textContent = '';
					body.innerHTML = value;
					return body.textContent ?? '';
				})
				.map((value) => value.replace(/\s+/g, ' ').trim())
				.filter(Boolean);
			return [...new Set(labels)].join('\n');
		} finally {
			xmlDom.window.close();
			htmlDom.window.close();
		}
	}
}

export class DrawioDiagramTextExtractor implements IDiagramContent {
	private readonly labels = new DrawioLabelExtractor();

	async extract(diagram: Diagram): Promise<string> {
		return this.labels.extract(diagram.source);
	}
}
