import {
	AlignmentType,
	BorderStyle,
	Document,
	ExternalHyperlink,
	Footer,
	Header,
	HeadingLevel,
	ImageRun,
	LevelFormat,
	LineRuleType,
	Packer,
	Paragraph,
	ShadingType,
	Table,
	TableCell,
	TableRow,
	TextRun,
	WidthType,
	type IHeaderOptions,
	type ISectionOptions
} from 'docx';
import type { ExportSettings, ExtractedTemplateStyles } from '$lib/models/deliverables';
import type { ProseMirrorDocument } from '$lib/models/notes';
import { defaultExportSettings } from '$lib/models/deliverables';
import {
	collectImageSources,
	fetchImages,
	mermaidSourceHash,
	svgDimensions
} from '$lib/server/repositories/deliverables/export-images';

export interface GenerateDocxInput {
	readonly notes: readonly { title: string; document: ProseMirrorDocument }[];
	readonly title: string;
	/** Template-extracted styles; when present they win over `settings` (explicit choice). */
	readonly styles?: ExtractedTemplateStyles;
	readonly settings?: ExportSettings;
	/** Mermaid SVGs pre-rendered by the browser, keyed by SHA-256 hex of the diagram source. */
	readonly diagramSvgs?: Record<string, string>;
	/** PNG rasters of the same diagrams, keyed identically; Word gets the raster. */
	readonly diagramPngs?: Record<string, string>;
}

const HEADING_LEVELS = [
	HeadingLevel.HEADING_1,
	HeadingLevel.HEADING_2,
	HeadingLevel.HEADING_3,
	HeadingLevel.HEADING_4,
	HeadingLevel.HEADING_5,
	HeadingLevel.HEADING_6
];

/** Fallback heading sizes in points, mirroring the PDF export. */
const HEADING_SIZES_PT = [18, 16, 14, 13, 12, 11];

/** Word fonts for the export settings' generic families. */
const SETTINGS_FONTS: Record<ExportSettings['fontFamily'], string> = {
	helvetica: 'Arial',
	times: 'Times New Roman',
	courier: 'Courier New'
};

/** A4 width in twips (210 mm); DOCX margins are twips too. */
const PAGE_WIDTH_TWIPS = 11906;
const TWIPS_PER_INCH = 1440;
const PX_PER_INCH = 96;

function resolveStyles(styles: ExtractedTemplateStyles | undefined, settings: ExportSettings) {
	if (styles) return styles;
	const margin = Math.round(settings.margin * 20);
	const resolved: ExtractedTemplateStyles = {
		fonts: {
			heading: {},
			body: { name: SETTINGS_FONTS[settings.fontFamily], size: settings.fontSize }
		},
		pageMargins: { top: margin, bottom: margin, left: margin, right: margin },
		themeColors: {}
	};
	return resolved;
}

interface DocxContext {
	readonly styles: ExtractedTemplateStyles;
	readonly settings: ExportSettings;
	readonly images: ReadonlyMap<string, string>;
	readonly diagramSvgs: Readonly<Record<string, string>>;
	readonly diagramPngs: Readonly<Record<string, string>>;
	/** Printable width in CSS pixels, for image and diagram sizing. */
	readonly contentWidthPx: number;
	readonly blockquoteDepth: number;
	/** Inside a table header cell: body runs render bold. */
	readonly forceBold: boolean;
}

function lineSpacing(settings: ExportSettings) {
	return { line: Math.round(settings.lineHeight * 240), lineRule: LineRuleType.AUTO };
}

function headerImageToImageRun(dataUrl: string): ImageRun | null {
	const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
	if (!match) return null;
	const buffer = Buffer.from(match[2], 'base64');
	return new ImageRun({
		type: 'png',
		data: buffer,
		transformation: { width: 200, height: 60 }
	});
}

function headingFont(
	styles: ExtractedTemplateStyles,
	level: number
): { name: string; size: number; bold: boolean; italics: boolean; color: string } {
	const key = `Heading${level}`;
	const h = styles.fonts.heading[key];
	return {
		name: h?.name ?? styles.fonts.body.name ?? 'Calibri',
		size: (h?.size ?? HEADING_SIZES_PT[level - 1] ?? 12) * 2,
		bold: h?.bold ?? true,
		italics: h?.italic ?? false,
		color: h?.color ?? '000000'
	};
}

/**
 * One inline run. A `link` mark produces a real hyperlink rather than bare text.
 *
 * Only `bold`, `italic` and `code` used to be read here, so a link's anchor text survived
 * an export while its URL was silently discarded — the destination simply vanished from
 * every .docx. PDF export has always handled the mark, which made the loss easy to miss.
 */
type InlineRun = TextRun | ExternalHyperlink;

function textRunFromNode(
	node: Record<string, unknown>,
	styles: ExtractedTemplateStyles,
	isCode: boolean = false,
	forceItalics: boolean = false,
	forceBold: boolean = false
): InlineRun {
	const text = (node.text as string) ?? '';
	const marks =
		(node.marks as Array<{ type: string; attrs?: Record<string, unknown> }> | undefined) ?? [];
	let bold = forceBold;
	let italics = forceItalics;
	let fontName = isCode ? 'Courier New' : (styles.fonts.body.name ?? 'Calibri');
	let fontSize = isCode ? 18 : (styles.fonts.body.size ?? 11) * 2;
	let href: string | undefined;

	for (const mark of marks) {
		if (mark.type === 'bold') bold = true;
		if (mark.type === 'italic') italics = true;
		if (mark.type === 'code') {
			fontName = 'Courier New';
			fontSize = 18;
		}
		if (mark.type === 'link' && typeof mark.attrs?.href === 'string') href = mark.attrs.href;
	}

	if (href)
		return new ExternalHyperlink({
			link: href,
			// Word's built-in character style, so the link looks like a link in whatever
			// template the document was generated from.
			children: [
				new TextRun({ text, bold, italics, font: fontName, size: fontSize, style: 'Hyperlink' })
			]
		});

	return new TextRun({ text, bold, italics, font: fontName, size: fontSize });
}

function collectText(node: Record<string, unknown>): string {
	if (node.type === 'text') return (node.text as string) ?? '';
	if (node.content) {
		return (node.content as Array<Record<string, unknown>>).map(collectText).join('');
	}
	return '';
}

/** Runs for one paragraph's inline content, honouring blockquote/table-header context. */
function inlineRuns(content: readonly Record<string, unknown>[], ctx: DocxContext): InlineRun[] {
	const children: InlineRun[] = [];
	for (const child of content) {
		if (child.type === 'text') {
			children.push(
				textRunFromNode(child, ctx.styles, false, ctx.blockquoteDepth > 0, ctx.forceBold)
			);
		} else if (child.type === 'hardBreak') {
			children.push(new TextRun({ break: 1 }));
		}
	}
	return children;
}

function parseDataUrl(dataUrl: string): { mediaType: string; buffer: Buffer } | null {
	const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
	if (!match) return null;
	return { mediaType: match[1]!, buffer: Buffer.from(match[2]!, 'base64') };
}

const RUN_IMAGE_TYPES: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/gif': 'gif',
	'image/bmp': 'bmp'
};

/** Natural size of a PNG or JPEG, read from the headers; undefined when unrecognized. */
function rasterDimensions(buffer: Buffer): { width: number; height: number } | undefined {
	// PNG: 8-byte signature, IHDR width/height at byte offsets 16/20.
	if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
		return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
	}
	// JPEG: walk segments to the first start-of-frame marker (0xC0–0xCF minus DHT/JPG/DAC).
	if (buffer.length > 4 && buffer.readUInt16BE(0) === 0xffd8) {
		let offset = 2;
		while (offset + 9 < buffer.length) {
			if (buffer[offset] !== 0xff) break;
			const marker = buffer[offset + 1]!;
			if (
				marker >= 0xc0 &&
				marker <= 0xcf &&
				marker !== 0xc4 &&
				marker !== 0xc8 &&
				marker !== 0xcc
			) {
				return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
			}
			offset += 2 + buffer.readUInt16BE(offset + 2);
		}
	}
	return undefined;
}

/**
 * A body image, sized like the PDF export: the editor's width attribute when set
 * (percent of the printable width, or pixels), otherwise the natural size, always
 * capped to the printable width with the aspect ratio preserved.
 */
function bodyImageRun(dataUrl: string, widthAttr: unknown, ctx: DocxContext): ImageRun | null {
	const parsed = parseDataUrl(dataUrl);
	if (!parsed) return null;
	const type = RUN_IMAGE_TYPES[parsed.mediaType];
	if (!type) return null;
	const natural = rasterDimensions(parsed.buffer);

	let width: number;
	if (typeof widthAttr === 'string' && widthAttr.endsWith('%')) {
		const percentage = Number.parseFloat(widthAttr);
		width = Number.isFinite(percentage)
			? (Math.min(percentage, 100) / 100) * ctx.contentWidthPx
			: (natural?.width ?? ctx.contentWidthPx);
	} else if (typeof widthAttr === 'number' && Number.isFinite(widthAttr)) {
		width = widthAttr;
	} else {
		width = natural?.width ?? ctx.contentWidthPx;
	}
	width = Math.min(width, ctx.contentWidthPx);
	const height = natural ? (width / natural.width) * natural.height : width * 0.75;

	return new ImageRun({
		type,
		data: parsed.buffer,
		transformation: { width: Math.round(width), height: Math.round(height) }
	});
}

/**
 * Code as one paragraph of mono runs with real line breaks; a raw `\n` inside a
 * run's text does not survive Word's whitespace handling.
 */
function codeParagraph(text: string): Paragraph {
	const children: TextRun[] = [];
	text.split('\n').forEach((line, index) => {
		if (index > 0) children.push(new TextRun({ break: 1 }));
		children.push(new TextRun({ text: line, font: 'Courier New', size: 18 }));
	});
	return new Paragraph({ children });
}

const TABLE_LINE_COLOR = 'D1D5DB';
const TABLE_HEADER_FILL = 'F3F4F6';

/** Convert a Tiptap table node into a Word table, keeping spans and header rows. */
function tableBlock(node: Record<string, unknown>, ctx: DocxContext): Table | null {
	const rows = (node.content as Array<Record<string, unknown>> | undefined) ?? [];
	const tableRows: TableRow[] = [];
	let columnCount = 0;

	rows.forEach((row, rowIndex) => {
		const cells = (row.content as Array<Record<string, unknown>> | undefined) ?? [];
		const isHeaderRow = cells.length > 0 && cells.every((cell) => cell.type === 'tableHeader');
		const tableCells: TableCell[] = [];
		let column = 0;
		for (const cell of cells) {
			const cellAttrs = (cell.attrs as Record<string, unknown> | undefined) ?? {};
			const columnSpan = Math.max((cellAttrs.colspan as number) ?? 1, 1);
			const rowSpan = Math.max((cellAttrs.rowspan as number) ?? 1, 1);
			const cellContent = (cell.content as Array<Record<string, unknown>> | undefined) ?? [];
			// The docx library inserts the vertical-merge continuation cells a rowSpan
			// implies into the following rows itself, so covered slots need no padding here.
			const cellCtx: DocxContext = cell.type === 'tableHeader' ? { ...ctx, forceBold: true } : ctx;
			const children = cellContent.flatMap((c) => convertNode(c, cellCtx));
			tableCells.push(
				new TableCell({
					...(columnSpan > 1 ? { columnSpan } : {}),
					...(rowSpan > 1 ? { rowSpan } : {}),
					...(cell.type === 'tableHeader'
						? { shading: { type: ShadingType.CLEAR, fill: TABLE_HEADER_FILL } }
						: {}),
					children: children.length > 0 ? children : [new Paragraph({ children: [] })]
				})
			);
			column += columnSpan;
		}
		columnCount = Math.max(columnCount, column);
		tableRows.push(
			new TableRow({
				...(rowIndex === 0 && isHeaderRow ? { tableHeader: true } : {}),
				children: tableCells
			})
		);
	});

	if (tableRows.length === 0 || columnCount === 0) return null;

	// Honour the editor's column widths when the first row records them; scale the
	// pixel widths to the printable width in twips. Otherwise let Word distribute.
	const contentWidthTwips =
		PAGE_WIDTH_TWIPS - ctx.styles.pageMargins.left - ctx.styles.pageMargins.right;
	const firstRowCells = (rows[0]?.content as Array<Record<string, unknown>> | undefined) ?? [];
	const colwidths = firstRowCells
		.map((cell) => (cell.attrs as Record<string, unknown> | undefined)?.colwidth)
		.map((value) => (Array.isArray(value) ? Number(value[0]) : undefined));
	const totalWidth =
		colwidths.every((w): w is number => typeof w === 'number' && Number.isFinite(w) && w > 0) &&
		colwidths.length === columnCount
			? colwidths.reduce((sum, w) => sum + w, 0)
			: undefined;

	const border = { style: BorderStyle.SINGLE, size: 4, color: TABLE_LINE_COLOR };
	return new Table({
		width: { size: 100, type: WidthType.PERCENTAGE },
		...(totalWidth
			? {
					columnWidths: colwidths.map((w) =>
						Math.round(((w as number) / totalWidth) * contentWidthTwips)
					)
				}
			: {}),
		borders: {
			top: border,
			bottom: border,
			left: border,
			right: border,
			insideHorizontal: border,
			insideVertical: border
		},
		rows: tableRows
	});
}

/** A diagram: the browser-rendered PNG when supplied, otherwise the source as code. */
function mermaidBlock(node: Record<string, unknown>, ctx: DocxContext): Paragraph[] {
	const source = collectText(node);
	const hash = mermaidSourceHash(source);
	const png = ctx.diagramPngs[hash];
	if (png) {
		const parsed = parseDataUrl(png);
		if (parsed) {
			// The PNG is rasterized at 2x; the SVG viewBox is the intended display size.
			const dimensions =
				svgDimensions(ctx.diagramSvgs[hash] ?? '') ?? rasterDimensions(parsed.buffer);
			let width = dimensions?.width ?? ctx.contentWidthPx;
			let height = dimensions?.height ?? width * 0.6;
			if (width > ctx.contentWidthPx) {
				height = (ctx.contentWidthPx / width) * height;
				width = ctx.contentWidthPx;
			}
			return [
				new Paragraph({
					children: [
						new ImageRun({
							type: 'png',
							data: parsed.buffer,
							transformation: { width: Math.round(width), height: Math.round(height) }
						})
					]
				})
			];
		}
	}
	// Without a browser render the diagram source is still worth keeping.
	return [codeParagraph(source)];
}

function convertNode(
	node: Record<string, unknown>,
	ctx: DocxContext,
	depth: number = 0
): (Paragraph | Table)[] {
	const type = node.type as string;
	const content = (node.content as Array<Record<string, unknown>> | undefined) ?? [];
	const attrs = (node.attrs as Record<string, unknown> | undefined) ?? {};
	const results: (Paragraph | Table)[] = [];

	switch (type) {
		case 'heading': {
			const level = Math.min((attrs.level as number) ?? 1, 6);
			const text = collectText(node);
			const h = headingFont(ctx.styles, level);
			results.push(
				new Paragraph({
					heading: HEADING_LEVELS[level - 1],
					children: [
						new TextRun({
							text,
							font: h.name,
							size: h.size,
							bold: h.bold,
							italics: h.italics,
							color: h.color
						})
					]
				})
			);
			break;
		}
		case 'paragraph': {
			const children = inlineRuns(content, ctx);
			results.push(
				new Paragraph({
					...(ctx.blockquoteDepth > 0 ? { indent: { left: 720 * ctx.blockquoteDepth } } : {}),
					spacing: lineSpacing(ctx.settings),
					children
				})
			);
			break;
		}
		case 'bulletList':
		case 'orderedList': {
			for (const item of content) {
				if (item.type !== 'listItem') continue;
				const itemContent = (item.content as Array<Record<string, unknown>>) ?? [];
				for (const child of itemContent) {
					if (child.type === 'paragraph') {
						const runs = inlineRuns(
							(child.content as Array<Record<string, unknown>> | undefined) ?? [],
							ctx
						);
						results.push(
							new Paragraph({
								...(type === 'bulletList'
									? { bullet: { level: depth } }
									: { numbering: { reference: 'default-numbering', level: depth } }),
								spacing: lineSpacing(ctx.settings),
								children: runs.length > 0 ? runs : [new TextRun({ text: '' })]
							})
						);
					} else {
						// Nested lists (and anything else) keep their structure; depth only
						// changes for actual list nodes inside.
						results.push(...convertNode(child, ctx, depth + 1));
					}
				}
			}
			break;
		}
		case 'blockquote': {
			const inner: DocxContext = { ...ctx, blockquoteDepth: ctx.blockquoteDepth + 1 };
			for (const child of content) {
				results.push(...convertNode(child, inner, depth));
			}
			break;
		}
		case 'codeBlock': {
			results.push(codeParagraph(collectText(node)));
			break;
		}
		case 'mermaid': {
			results.push(...mermaidBlock(node, ctx));
			break;
		}
		case 'horizontalRule': {
			// docx has no horizontal-rule element; an empty paragraph with a bottom border renders one.
			results.push(
				new Paragraph({
					border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'auto', space: 1 } },
					spacing: { before: 120, after: 120 }
				})
			);
			break;
		}
		case 'image': {
			const src = attrs.src as string | undefined;
			if (!src) break;
			const data = src.startsWith('data:') ? src : ctx.images.get(src);
			if (!data) {
				results.push(
					new Paragraph({
						children: [new TextRun({ text: '[image unavailable]', italics: true, color: '9CA3AF' })]
					})
				);
				break;
			}
			const run = bodyImageRun(data, attrs.width, ctx);
			if (run) results.push(new Paragraph({ children: [run] }));
			break;
		}
		case 'table': {
			const table = tableBlock(node, ctx);
			if (table) results.push(table);
			break;
		}
		default: {
			for (const child of content) {
				results.push(...convertNode(child, ctx, depth));
			}
		}
	}

	return results;
}

export async function generateDocx(input: GenerateDocxInput): Promise<Buffer> {
	const { notes } = input;
	const settings = input.settings ?? defaultExportSettings;
	const styles = resolveStyles(input.styles, settings);
	const images = await fetchImages(notes.flatMap((note) => collectImageSources(note.document)));
	const ctx: DocxContext = {
		styles,
		settings,
		images,
		diagramSvgs: input.diagramSvgs ?? {},
		diagramPngs: input.diagramPngs ?? {},
		contentWidthPx:
			((PAGE_WIDTH_TWIPS - styles.pageMargins.left - styles.pageMargins.right) / TWIPS_PER_INCH) *
			PX_PER_INCH,
		blockquoteDepth: 0,
		forceBold: false
	};
	const allBlocks: (Paragraph | Table)[] = [];

	// The export title is the file name; it only lands on the page when asked for.
	if (settings.includeTitle) {
		allBlocks.push(
			new Paragraph({
				heading: HeadingLevel.HEADING_1,
				alignment: AlignmentType.CENTER,
				children: [
					new TextRun({
						text: input.title,
						font: styles.fonts.body.name ?? 'Calibri',
						size: 48,
						bold: true
					})
				]
			})
		);
		allBlocks.push(new Paragraph({ children: [] }));
	}

	for (const note of notes) {
		if (note.title && note.title !== input.title) {
			allBlocks.push(
				new Paragraph({
					heading: HeadingLevel.HEADING_2,
					children: [
						new TextRun({
							text: note.title,
							font: styles.fonts.body.name ?? 'Calibri',
							size: 26,
							bold: true
						})
					]
				})
			);
		}

		const docContent = note.document.content ?? [];
		for (const node of docContent as Array<Record<string, unknown>>) {
			allBlocks.push(...convertNode(node, ctx));
		}

		allBlocks.push(new Paragraph({ children: [] }));
	}

	const headerChildren: (Paragraph | Table)[] = [];
	if (styles.headerImages?.length) {
		const imgRun = headerImageToImageRun(styles.headerImages[0]!);
		if (imgRun) {
			headerChildren.push(new Paragraph({ children: [imgRun] }));
		}
	}
	const headerOptions: IHeaderOptions = { children: headerChildren };

	const section: ISectionOptions = {
		properties: {
			page: {
				margin: {
					top: styles.pageMargins.top,
					bottom: styles.pageMargins.bottom,
					left: styles.pageMargins.left,
					right: styles.pageMargins.right
				}
			}
		},
		headers: { default: new Header(headerOptions) },
		...(styles.footerContent
			? {
					footers: {
						default: new Footer({
							children: [
								new Paragraph({
									alignment: AlignmentType.CENTER,
									children: [new TextRun({ text: styles.footerContent, size: 16 })]
								})
							]
						})
					}
				}
			: {}),
		children: allBlocks
	};

	const doc = new Document({
		styles: {
			default: {
				document: {
					run: {
						font: styles.fonts.body.name ?? 'Calibri',
						size: (styles.fonts.body.size ?? 11) * 2
					}
				}
			}
		},
		// Ordered lists reference 'default-numbering'; without a definition Word
		// renders no numbers at all.
		numbering: {
			config: [
				{
					reference: 'default-numbering',
					levels: [0, 1, 2, 3].map((level) => ({
						level,
						format: LevelFormat.DECIMAL,
						text: `%${level + 1}.`,
						alignment: AlignmentType.START,
						style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } }
					}))
				}
			]
		},
		sections: [section]
	});

	return Buffer.from(await Packer.toBuffer(doc));
}
