import { resolve, sep } from 'node:path';
import { openSync as openFontSync } from 'fontkit';
import pdfmake from 'pdfmake';
import type { ExportSettings, ExtractedTemplateStyles } from '$lib/models/deliverables';
import type { ProseMirrorDocument } from '$lib/models/notes';
import { defaultExportSettings } from '$lib/models/deliverables';
import {
	collectImageSources,
	fetchImages,
	mermaidSourceHash
} from '$lib/server/repositories/deliverables/export-images';

// pdf.spec.ts imports the hash from here; keep the re-export.
export { mermaidSourceHash };

// Embedded Noto fonts ship in the repo (assets/fonts, OFL-licensed): PDFKit's
// standard-14 fonts are WinAnsi-only, so emoji and most non-Latin-1 text need
// real TTFs. Color emoji fonts (CBDT/COLR) cannot be embedded by PDFKit, hence
// the monochrome Noto Emoji. Paths resolve from the app root, which is the
// working directory in dev, tests, and the Docker runtime image.
const FONTS_DIR = resolve(process.cwd(), 'assets/fonts');

const FONT_FILES: Record<string, Record<string, string>> = {
	NotoSans: {
		normal: 'NotoSans-Regular.ttf',
		bold: 'NotoSans-Bold.ttf',
		italics: 'NotoSans-Italic.ttf',
		bolditalics: 'NotoSans-BoldItalic.ttf'
	},
	NotoSerif: {
		normal: 'NotoSerif-Regular.ttf',
		bold: 'NotoSerif-Bold.ttf',
		italics: 'NotoSerif-Italic.ttf',
		bolditalics: 'NotoSerif-BoldItalic.ttf'
	},
	// Mono has no italic cuts; alias them to the upright styles.
	NotoSansMono: {
		normal: 'NotoSansMono-Regular.ttf',
		bold: 'NotoSansMono-Bold.ttf',
		italics: 'NotoSansMono-Regular.ttf',
		bolditalics: 'NotoSansMono-Bold.ttf'
	},
	// Fallback-only families, single cut each.
	NotoEmoji: {
		normal: 'NotoEmoji.ttf',
		bold: 'NotoEmoji.ttf',
		italics: 'NotoEmoji.ttf',
		bolditalics: 'NotoEmoji.ttf'
	},
	NotoSansSymbols2: {
		normal: 'NotoSansSymbols2-Regular.ttf',
		bold: 'NotoSansSymbols2-Regular.ttf',
		italics: 'NotoSansSymbols2-Regular.ttf',
		bolditalics: 'NotoSansSymbols2-Regular.ttf'
	},
	NotoSansMath: {
		normal: 'NotoSansMath-Regular.ttf',
		bold: 'NotoSansMath-Regular.ttf',
		italics: 'NotoSansMath-Regular.ttf',
		bolditalics: 'NotoSansMath-Regular.ttf'
	}
};

const FONT_FAMILIES: Record<ExportSettings['fontFamily'], string> = {
	helvetica: 'NotoSans',
	times: 'NotoSerif',
	courier: 'NotoSansMono'
};

const MONO_FONT = 'NotoSansMono';

// Fallback order when a run's own font cannot draw a character: emoji first so
// pictographs keep their emoji design, then symbols (arrows, shapes, dingbats),
// then math (operators). Base Noto Sans/Serif/Mono cover the common scripts.
const FALLBACK_FONTS = ['NotoEmoji', 'NotoSansSymbols2', 'NotoSansMath'];

// Joiners and variation selectors need no glyph of their own.
const JOINER_CODEPOINTS = new Set([0x200d, 0xfe0e, 0xfe0f]);

interface FontHandle {
	hasGlyphForCodePoint(codepoint: number): boolean;
}

const fontCoverage = new Map<string, FontHandle>();

function covers(family: string, codepoint: number): boolean {
	const cached = fontCoverage.get(family);
	if (cached) return cached.hasGlyphForCodePoint(codepoint);
	// All shipped fonts are single-face TTFs, never collections.
	const handle = openFontSync(resolve(FONTS_DIR, FONT_FILES[family]!.normal!)) as FontHandle;
	fontCoverage.set(family, handle);
	return handle.hasGlyphForCodePoint(codepoint);
}

/** First font in the fallback chain that can draw every codepoint of the cluster. */
function fallbackForCluster(cluster: string, baseFont: string): string | undefined {
	const codepoints = [...cluster]
		.map((char) => char.codePointAt(0)!)
		.filter((codepoint) => !JOINER_CODEPOINTS.has(codepoint));
	if (codepoints.every((codepoint) => covers(baseFont, codepoint))) return undefined;
	return FALLBACK_FONTS.find((family) =>
		codepoints.every((codepoint) => covers(family, codepoint))
	);
}

const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Split a text run into per-font runs. pdfmake has no font fallback, so
 * characters a run's font cannot draw (emoji, arrows, math operators) would
 * render as missing glyphs. Grapheme-level segmentation keeps ZWJ sequences,
 * keycaps, and variation selectors inside a single run.
 */
function withFontRuns<T extends { text: string; font?: string }>(run: T, bodyFont: string): T[] {
	const baseFont = run.font ?? bodyFont;
	let chunk = '';
	let chunkFont: string | undefined;
	let sawFallback = false;
	const runs: T[] = [];
	const flush = () => {
		if (!chunk) return;
		runs.push({ ...run, text: chunk, ...(chunkFont ? { font: chunkFont } : {}) });
		chunk = '';
	};
	for (const { segment } of graphemeSegmenter.segment(run.text)) {
		const font = fallbackForCluster(segment, baseFont);
		if (font) sawFallback = true;
		if (chunk && font !== chunkFont) flush();
		chunkFont = font;
		chunk += segment;
	}
	flush();
	return sawFallback ? runs : [run];
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const LINK_COLOR = '#1d4ed8';

export interface GeneratePdfInput {
	readonly notes: readonly { title: string; document: ProseMirrorDocument }[];
	readonly title: string;
	readonly styles?: ExtractedTemplateStyles;
	readonly settings?: ExportSettings;
	/** Mermaid SVGs pre-rendered by the browser, keyed by SHA-256 hex of the diagram source. */
	readonly diagramSvgs?: Record<string, string>;
	/** PNG rasters of the same diagrams, keyed identically; preferred over the SVGs. */
	readonly diagramPngs?: Record<string, string>;
}

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
	font?: string;
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
	readonly images: ReadonlyMap<string, string>;
	readonly diagramSvgs: Readonly<Record<string, string>>;
	readonly diagramPngs: Readonly<Record<string, string>>;
	/** Resolved pdfmake family for body text; the base font for fallback splitting. */
	readonly bodyFont: string;
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
function codePanel(text: string): unknown {
	const runs: unknown[] = [...withFontRuns({ text, color: '#1f2328' }, MONO_FONT)];
	return {
		table: {
			widths: ['*'],
			body: [
				[
					{
						text: runs,
						font: MONO_FONT,
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
			const sizes = [18, 16, 14, 13, 12, 11];
			return {
				text: withFontRuns({ text: collectText(node) }, context.bodyFont),
				fontSize: sizes[level - 1],
				bold: true,
				margin: [0, 10, 0, 5]
			};
		}
		case 'paragraph': {
			const children: unknown[] = [];
			for (const child of content) {
				if (child.type === 'text') {
					children.push(...withFontRuns(textRunFromNode(child), context.bodyFont));
				} else if (child.type === 'hardBreak') {
					if (children.length > 0) children.push('\n');
				}
			}
			return { text: children.length > 0 ? children : '', margin: [0, 0, 0, 4] };
		}
		case 'bulletList':
		case 'orderedList': {
			return {
				[type === 'bulletList' ? 'ul' : 'ol']: content.map((item) => {
					const itemContent = (item.content as Array<Record<string, unknown>> | undefined) ?? [];
					const converted = itemContent.map((c) => convertNode(c, context)).flat();
					if (converted.length === 0) return { text: '' };
					// An item holding block content (a nested list, diagram, image, code
					// panel) must stay a stack of blocks: forced into a text run, pdfmake
					// silently drops everything that is not text.
					const inlineOnly = itemContent.every(
						(c) => c.type === 'paragraph' || c.type === 'text' || c.type === 'hardBreak'
					);
					if (inlineOnly) return { text: converted };
					return { stack: converted };
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
			return codePanel(collectText(node));
		}
		case 'mermaid': {
			const source = collectText(node);
			const hash = mermaidSourceHash(source);
			// The browser-rendered PNG raster is the reference rendering (the DOCX export
			// uses the same one); pdfmake's `fit` downscales to the content box, preserving
			// aspect, without upscaling — so diagrams always stay inline on the page.
			const png = context.diagramPngs[hash];
			if (png) {
				return {
					image: png,
					// Leave the block's own margins out of the fit box: an unbreakable block
					// reaching the exact page body height sits on a knife's edge.
					fit: [context.contentWidth, context.usableHeight - 16],
					margin: [0, 8, 0, 8]
				};
			}
			const svg = context.diagramSvgs[hash];
			if (svg) {
				return {
					svg,
					fit: [context.contentWidth, context.usableHeight - 16],
					margin: [0, 8, 0, 8]
				};
			}
			// Without a browser render the diagram source is still worth keeping.
			return codePanel(source);
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

export async function generatePdf(input: GeneratePdfInput): Promise<Buffer> {
	const { notes } = input;
	const settings = input.settings ?? defaultExportSettings;
	const printer = pdfmake;
	// Embed the repo-shipped Noto fonts; the local-access policy permits only
	// files inside assets/fonts, never arbitrary filesystem paths.
	printer.addFonts(
		Object.fromEntries(
			Object.entries(FONT_FILES).map(([family, styles]) => [
				family,
				Object.fromEntries(
					Object.entries(styles).map(([style, file]) => [style, resolve(FONTS_DIR, file)])
				)
			])
		)
	);
	printer.setLocalAccessPolicy((path) => resolve(path).startsWith(FONTS_DIR + sep));

	const margin = Math.min(Math.max(settings.margin, 18), 144);
	const contentWidth = A4_WIDTH - margin * 2;
	const usableHeight = A4_HEIGHT - margin * 2 - 16;
	const images = await fetchImages(notes.flatMap((note) => collectImageSources(note.document)));
	const bodyFont = FONT_FAMILIES[settings.fontFamily];
	const context: ConversionContext = {
		contentWidth,
		usableHeight,
		images,
		diagramSvgs: input.diagramSvgs ?? {},
		diagramPngs: input.diagramPngs ?? {},
		bodyFont
	};

	const content: unknown[] = [];

	// The export title is the file name; it only lands on the page when asked for.
	if (settings.includeTitle) {
		content.push({
			text: withFontRuns({ text: input.title }, bodyFont),
			fontSize: 24,
			bold: true,
			alignment: 'center',
			margin: [0, 0, 0, 16]
		});
	}

	for (const note of notes) {
		if (note.title && note.title !== input.title) {
			content.push({
				text: withFontRuns({ text: note.title }, bodyFont),
				fontSize: 16,
				bold: true,
				margin: [0, 12, 0, 8]
			});
		}

		content.push(...convertDoc(note.document, context));
		content.push({ text: '', margin: [0, 0, 0, 8] });
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
