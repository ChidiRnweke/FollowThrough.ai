import { createHash } from 'node:crypto';
import pdfmake from 'pdfmake';
import type { ExportSettings, ExtractedTemplateStyles, ProseMirrorDocument } from '$lib/models';
import { defaultExportSettings } from '$lib/models';

const STANDARD_FONTS = new Set([
	'Helvetica',
	'Helvetica-Bold',
	'Helvetica-Oblique',
	'Helvetica-BoldOblique',
	'Courier',
	'Courier-Bold',
	'Courier-Oblique',
	'Courier-BoldOblique',
	'Times-Roman',
	'Times-Bold',
	'Times-Italic',
	'Times-BoldItalic'
]);

const FONT_FAMILIES: Record<ExportSettings['fontFamily'], string> = {
	helvetica: 'Helvetica',
	times: 'Times',
	courier: 'Courier'
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const DIAGRAM_MAX_UPSCALE = 1.5;

/** Natural size of an SVG, from its viewBox. */
function svgDimensions(svg: string): { width: number; height: number } | undefined {
	const viewBox = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number);
	if (viewBox?.length === 4 && viewBox[2]! > 0 && viewBox[3]! > 0) {
		return { width: viewBox[2]!, height: viewBox[3]! };
	}
	return undefined;
}
const LINK_COLOR = '#1d4ed8';
const IMAGE_FETCH_TIMEOUT_MS = 8000;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const EMBEDDABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

export interface GeneratePdfInput {
	readonly notes: readonly { title: string; document: ProseMirrorDocument }[];
	readonly title: string;
	readonly styles?: ExtractedTemplateStyles;
	readonly settings?: ExportSettings;
	/** Mermaid SVGs pre-rendered by the browser, keyed by SHA-256 hex of the diagram source. */
	readonly diagramSvgs?: Record<string, string>;
}

export const mermaidSourceHash = (source: string): string =>
	createHash('sha256').update(source, 'utf8').digest('hex');

function collectText(node: Record<string, unknown>): string {
	if (node.type === 'text') return (node.text as string) ?? '';
	if (node.content) {
		return (node.content as Array<Record<string, unknown>>).map(collectText).join('');
	}
	return '';
}

interface InlineRun {
	text: string;
	bold?: boolean;
	italics?: boolean;
	link?: string;
	color?: string;
	decoration?: string;
}

function textRunFromNode(node: Record<string, unknown>): InlineRun {
	const text = (node.text as string) ?? '';
	const marks =
		(node.marks as Array<{ type: string; attrs?: Record<string, unknown> }> | undefined) ?? [];
	const run: InlineRun = { text };
	for (const mark of marks) {
		if (mark.type === 'bold') run.bold = true;
		if (mark.type === 'italic') run.italics = true;
		if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
			run.link = mark.attrs.href;
			run.color = LINK_COLOR;
			run.decoration = 'underline';
		}
	}
	return run;
}

interface ConversionContext {
	readonly contentWidth: number;
	readonly usableHeight: number;
	readonly landscapeWidth: number;
	readonly landscapeHeight: number;
	readonly images: ReadonlyMap<string, string>;
	readonly diagramSvgs: Readonly<Record<string, string>>;
}

function imageBlock(attrs: Record<string, unknown>, context: ConversionContext): unknown {
	const src = attrs.src as string | undefined;
	if (!src) return [];
	const data = src.startsWith('data:') ? src : context.images.get(src);
	if (!data) {
		return { text: '[image unavailable]', italics: true, color: '#9ca3af', margin: [0, 4, 0, 4] };
	}
	const width = attrs.width;
	let resolvedWidth: number | undefined;
	if (typeof width === 'string' && width.endsWith('%')) {
		const percentage = Number.parseFloat(width);
		if (Number.isFinite(percentage))
			resolvedWidth = (Math.min(percentage, 100) / 100) * context.contentWidth;
	} else if (typeof width === 'number' && Number.isFinite(width)) {
		resolvedWidth = Math.min(width * 0.75, context.contentWidth);
	}
	return {
		image: data,
		...(resolvedWidth
			? { width: resolvedWidth }
			: { fit: [context.contentWidth, context.contentWidth] }),
		margin: [0, 4, 0, 8]
	};
}

const TABLE_LINE_COLOR = '#d1d5db';
const TABLE_HEADER_FILL = '#f3f4f6';
const CODE_PANEL_FILL = '#f6f8fa';
const CODE_PANEL_LINE = '#e5e7eb';

/**
 * Render code as a padded, hairline-boxed panel. A single-cell table is the
 * pdfmake idiom for a filled box with inner padding; `preserveLeadingSpaces`
 * keeps the source indentation that plain text nodes would lose.
 */
function codePanel(text: string, language?: string): unknown {
	const runs: unknown[] = [];
	if (language) {
		runs.push({
			text: language.toUpperCase(),
			fontSize: 7.5,
			color: '#6b7280',
			lineHeight: 1.6
		});
	}
	runs.push({ text, color: '#1f2328' });
	return {
		table: {
			widths: ['*'],
			body: [
				[
					{
						text: runs,
						font: 'Courier',
						fontSize: 9,
						lineHeight: 1.25,
						preserveLeadingSpaces: true
					}
				]
			]
		},
		layout: {
			fillColor: CODE_PANEL_FILL,
			hLineWidth: () => 0.75,
			vLineWidth: () => 0.75,
			hLineColor: CODE_PANEL_LINE,
			vLineColor: CODE_PANEL_LINE,
			paddingLeft: () => 10,
			paddingRight: () => 10,
			paddingTop: () => 8,
			paddingBottom: () => 8
		},
		margin: [0, 6, 0, 10]
	};
}

/** Convert a Tiptap table node into a pdfmake table element. */
function tableBlock(node: Record<string, unknown>, context: ConversionContext): unknown {
	const rows = (node.content as Array<Record<string, unknown>> | undefined) ?? [];
	// Slots covered by a rowspan from an earlier row, per row index.
	const covered: Array<Set<number>> = rows.map(() => new Set<number>());
	const body: unknown[][] = [];
	let columnCount = 0;

	rows.forEach((row, rowIndex) => {
		const cells = (row.content as Array<Record<string, unknown>> | undefined) ?? [];
		const bodyRow: unknown[] = [];
		let column = 0;
		for (const cell of cells) {
			while (covered[rowIndex]!.has(column)) {
				bodyRow.push({});
				column += 1;
			}
			const cellAttrs = (cell.attrs as Record<string, unknown> | undefined) ?? {};
			const colSpan = Math.max((cellAttrs.colspan as number) ?? 1, 1);
			const rowSpan = Math.max((cellAttrs.rowspan as number) ?? 1, 1);
			const cellContent = (cell.content as Array<Record<string, unknown>> | undefined) ?? [];
			const converted = cellContent.map((c) => convertNode(c, context)).flat();
			const entry: Record<string, unknown> = {
				...(converted.length > 0 ? { text: converted } : { text: '' }),
				...(colSpan > 1 ? { colSpan } : {}),
				...(rowSpan > 1 ? { rowSpan } : {})
			};
			if (cell.type === 'tableHeader') {
				entry.bold = true;
				entry.fillColor = TABLE_HEADER_FILL;
			}
			bodyRow.push(entry);
			for (let offset = 1; offset < colSpan; offset += 1) {
				bodyRow.push({});
				if (rowSpan > 1) {
					for (let r = rowIndex + 1; r < Math.min(rowIndex + rowSpan, rows.length); r += 1) {
						covered[r]!.add(column + offset);
					}
				}
			}
			if (rowSpan > 1) {
				for (let r = rowIndex + 1; r < Math.min(rowIndex + rowSpan, rows.length); r += 1) {
					covered[r]!.add(column);
				}
			}
			column += colSpan;
		}
		while (covered[rowIndex]!.has(column)) {
			bodyRow.push({});
			column += 1;
		}
		columnCount = Math.max(columnCount, column);
		body.push(bodyRow);
	});

	if (body.length === 0 || columnCount === 0) return [];

	// Honour the editor's column widths when the first row records them; scale
	// the pixel widths to fit the printable area. Otherwise distribute evenly.
	const firstRowCells = (rows[0]?.content as Array<Record<string, unknown>> | undefined) ?? [];
	const colwidths = firstRowCells
		.map((cell) => (cell.attrs as Record<string, unknown> | undefined)?.colwidth)
		.map((value) => (Array.isArray(value) ? Number(value[0]) : undefined));
	const totalWidth =
		colwidths.every((w): w is number => typeof w === 'number' && Number.isFinite(w) && w > 0) &&
		colwidths.length === columnCount
			? colwidths.reduce((sum, w) => sum + w, 0)
			: undefined;
	const widths = totalWidth
		? colwidths.map((w) => ((w as number) / totalWidth) * context.contentWidth)
		: Array.from({ length: columnCount }, () => '*');

	const hasHeaderRow =
		firstRowCells.length > 0 && firstRowCells.every((cell) => cell.type === 'tableHeader');

	return {
		table: {
			...(hasHeaderRow ? { headerRows: 1 } : {}),
			widths,
			body
		},
		layout: {
			hLineColor: TABLE_LINE_COLOR,
			vLineColor: TABLE_LINE_COLOR
		},
		margin: [0, 4, 0, 8]
	};
}

function convertNode(node: Record<string, unknown>, context: ConversionContext): unknown {
	const type = node.type as string;
	const content = (node.content as Array<Record<string, unknown>> | undefined) ?? [];
	const attrs = (node.attrs as Record<string, unknown> | undefined) ?? {};

	switch (type) {
		case 'heading': {
			const level = Math.min((attrs.level as number) ?? 1, 6);
			const text = collectText(node);
			const sizes = [18, 16, 14, 13, 12, 11];
			return { text, fontSize: sizes[level - 1], bold: true, margin: [0, 10, 0, 5] };
		}
		case 'paragraph': {
			const children: unknown[] = [];
			for (const child of content) {
				if (child.type === 'text') {
					children.push(textRunFromNode(child));
				} else if (child.type === 'hardBreak') {
					if (children.length > 0) children.push('\n');
				}
			}
			return { text: children.length > 0 ? children : '', margin: [0, 0, 0, 4] };
		}
		case 'bulletList': {
			return {
				ul: content.map((item) => {
					const itemContent = (item.content as Array<Record<string, unknown>> | undefined) ?? [];
					const texts = itemContent.map((c) => convertNode(c, context)).flat();
					return { text: texts.length > 0 ? texts : '' };
				})
			};
		}
		case 'orderedList': {
			return {
				ol: content.map((item) => {
					const itemContent = (item.content as Array<Record<string, unknown>> | undefined) ?? [];
					const texts = itemContent.map((c) => convertNode(c, context)).flat();
					return { text: texts.length > 0 ? texts : '' };
				})
			};
		}
		case 'blockquote': {
			const blockContent = content.map((c) => convertNode(c, context)).flat();
			return blockContent.map((item) => {
				if (typeof item === 'object' && item !== null) {
					return { ...(item as Record<string, unknown>), italics: true, margin: [20, 0, 20, 4] };
				}
				return { text: item, italics: true, margin: [20, 0, 20, 4] };
			});
		}
		case 'codeBlock': {
			const language =
				typeof attrs.language === 'string' && attrs.language ? attrs.language : undefined;
			return codePanel(collectText(node), language);
		}
		case 'mermaid': {
			const source = collectText(node);
			const svg = context.diagramSvgs[mermaidSourceHash(source)];
			if (svg) {
				// Give diagrams the full content box: wide charts span the page width and
				// tall charts may take a whole page, so labels stay readable.
				const dimensions = svgDimensions(svg);
				if (dimensions) {
					const portraitScale = Math.min(
						context.contentWidth / dimensions.width,
						context.usableHeight / dimensions.height,
						DIAGRAM_MAX_UPSCALE
					);
					const landscapeScale = Math.min(
						context.landscapeWidth / dimensions.width,
						context.landscapeHeight / dimensions.height,
						DIAGRAM_MAX_UPSCALE
					);
					// A diagram that would shrink badly gets its own landscape page when
					// that buys meaningfully larger rendering.
					if (portraitScale < 0.65 && landscapeScale > portraitScale * 1.15) {
						return {
							svg,
							width: dimensions.width * landscapeScale,
							margin: [0, 8, 0, 8],
							pageBreak: 'before',
							pageOrientation: 'landscape',
							restorePortraitAfter: true
						};
					}
					return { svg, width: dimensions.width * portraitScale, margin: [0, 8, 0, 8] };
				}
				return { svg, fit: [context.contentWidth, context.usableHeight], margin: [0, 8, 0, 8] };
			}
			// Without a browser-rendered SVG the diagram source is still worth keeping.
			return codePanel(source, 'mermaid');
		}
		case 'horizontalRule': {
			return {
				canvas: [
					{
						type: 'line',
						x1: 0,
						y1: 5,
						x2: context.contentWidth,
						y2: 5,
						lineWidth: 1,
						lineColor: '#cccccc'
					}
				],
				margin: [0, 8, 0, 8]
			};
		}
		case 'image': {
			return imageBlock(attrs, context);
		}
		case 'table': {
			return tableBlock(node, context);
		}
		case 'text': {
			return textRunFromNode(node);
		}
		case 'hardBreak': {
			return '\n';
		}
		default: {
			if (content.length > 0) {
				return content.map((c) => convertNode(c, context)).flat();
			}
			return [];
		}
	}
}

function convertDoc(doc: ProseMirrorDocument, context: ConversionContext): unknown[] {
	const content = (doc.content as Array<Record<string, unknown>> | undefined) ?? [];
	const result: unknown[] = [];
	for (const node of content) {
		const converted = convertNode(node, context);
		if (Array.isArray(converted)) {
			result.push(...converted);
		} else {
			result.push(converted);
		}
	}
	return result;
}

function collectImageSources(doc: ProseMirrorDocument): string[] {
	const sources: string[] = [];
	const walk = (node: Record<string, unknown>): void => {
		if (node.type === 'image') {
			const src = (node.attrs as Record<string, unknown> | undefined)?.src;
			if (typeof src === 'string' && /^https?:\/\//.test(src)) sources.push(src);
		}
		for (const child of (node.content as Array<Record<string, unknown>> | undefined) ?? [])
			walk(child);
	};
	walk(doc as unknown as Record<string, unknown>);
	return sources;
}

/** Fetch remote images and inline them as data URLs; failures are skipped, never fatal. */
async function fetchImages(sources: readonly string[]): Promise<Map<string, string>> {
	const images = new Map<string, string>();
	await Promise.all(
		[...new Set(sources)].map(async (src) => {
			try {
				const response = await fetch(src, {
					signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
					redirect: 'follow'
				});
				if (!response.ok) return;
				const mediaType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim();
				if (!EMBEDDABLE_IMAGE_TYPES.has(mediaType)) return;
				const bytes = Buffer.from(await response.arrayBuffer());
				if (bytes.byteLength > IMAGE_MAX_BYTES) return;
				images.set(src, `data:${mediaType};base64,${bytes.toString('base64')}`);
			} catch {
				// Unreachable images degrade to a placeholder in the document.
			}
		})
	);
	return images;
}

export async function generatePdf(input: GeneratePdfInput): Promise<Buffer> {
	const { notes } = input;
	const settings = input.settings ?? defaultExportSettings;
	const printer = pdfmake;
	// Map to PDFKit's built-in standard fonts so no font files ship with the app.
	printer.addFonts({
		Helvetica: {
			normal: 'Helvetica',
			bold: 'Helvetica-Bold',
			italics: 'Helvetica-Oblique',
			bolditalics: 'Helvetica-BoldOblique'
		},
		Times: {
			normal: 'Times-Roman',
			bold: 'Times-Bold',
			italics: 'Times-Italic',
			bolditalics: 'Times-BoldItalic'
		},
		Courier: {
			normal: 'Courier',
			bold: 'Courier-Bold',
			italics: 'Courier-Oblique',
			bolditalics: 'Courier-BoldOblique'
		}
	});
	// pdfmake validates font references through the local-access policy; permit only
	// PDFKit's built-in font names, never real filesystem paths.
	printer.setLocalAccessPolicy((path) => STANDARD_FONTS.has(path));

	const margin = Math.min(Math.max(settings.margin, 18), 144);
	const contentWidth = A4_WIDTH - margin * 2;
	const usableHeight = A4_HEIGHT - margin * 2 - 16;
	const images = await fetchImages(notes.flatMap((note) => collectImageSources(note.document)));
	const context: ConversionContext = {
		contentWidth,
		usableHeight,
		landscapeWidth: A4_HEIGHT - margin * 2,
		landscapeHeight: A4_WIDTH - margin * 2 - 16,
		images,
		diagramSvgs: input.diagramSvgs ?? {}
	};

	const content: unknown[] = [];

	// The export title is the file name; it only lands on the page when asked for.
	if (settings.includeTitle) {
		content.push({
			text: input.title,
			fontSize: 24,
			bold: true,
			alignment: 'center',
			margin: [0, 0, 0, 16]
		});
	}

	for (const note of notes) {
		if (note.title && note.title !== input.title) {
			content.push({ text: note.title, fontSize: 16, bold: true, margin: [0, 12, 0, 8] });
		}

		content.push(...convertDoc(note.document, context));
		content.push({ text: '', margin: [0, 0, 0, 8] });
	}

	// A landscape diagram page must flip the following content back to portrait.
	let restorePortrait = false;
	for (const item of content) {
		const record = item as Record<string, unknown>;
		if (restorePortrait && record.pageOrientation === undefined) {
			record.pageBreak = 'before';
			record.pageOrientation = 'portrait';
		}
		restorePortrait = record.restorePortraitAfter === true;
		delete record.restorePortraitAfter;
	}

	const docDefinition: Record<string, unknown> = {
		content,
		defaultStyle: {
			font: FONT_FAMILIES[settings.fontFamily],
			fontSize: settings.fontSize,
			lineHeight: settings.lineHeight
		},
		pageSize: 'A4',
		pageMargins: [margin, margin, margin, margin]
	};

	return printer.createPdf(docDefinition).getBuffer();
}
