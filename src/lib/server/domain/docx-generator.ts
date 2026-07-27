import {
	AlignmentType,
	BorderStyle,
	Document,
	ExternalHyperlink,
	Footer,
	Header,
	HeadingLevel,
	ImageRun,
	Packer,
	Paragraph,
	TextRun,
	type IHeaderOptions,
	type ISectionOptions
} from 'docx';
import type { ExtractedTemplateStyles, ProseMirrorDocument } from '$lib/models';

export interface GenerateDocxInput {
	readonly notes: readonly { title: string; document: ProseMirrorDocument }[];
	readonly styles: ExtractedTemplateStyles;
	readonly title: string;
}

const HEADING_LEVELS = [
	HeadingLevel.HEADING_1,
	HeadingLevel.HEADING_2,
	HeadingLevel.HEADING_3,
	HeadingLevel.HEADING_4,
	HeadingLevel.HEADING_5,
	HeadingLevel.HEADING_6
];

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
		name: h?.name ?? 'Calibri',
		size: (h?.size ?? 12) * 2,
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
	isCode: boolean = false
): InlineRun {
	const text = (node.text as string) ?? '';
	const marks =
		(node.marks as Array<{ type: string; attrs?: Record<string, unknown> }> | undefined) ?? [];
	let bold = false;
	let italics = false;
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

async function convertNode(
	node: Record<string, unknown>,
	styles: ExtractedTemplateStyles,
	depth: number = 0
): Promise<Paragraph[]> {
	const type = node.type as string;
	const content = (node.content as Array<Record<string, unknown>> | undefined) ?? [];
	const attrs = (node.attrs as Record<string, unknown> | undefined) ?? {};
	const results: Paragraph[] = [];

	switch (type) {
		case 'heading': {
			const level = Math.min((attrs.level as number) ?? 1, 6);
			const text = collectText(node);
			const h = headingFont(styles, level);
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
			const children: InlineRun[] = [];
			for (const child of content) {
				if (child.type === 'text') {
					children.push(textRunFromNode(child, styles));
				} else if (child.type === 'hardBreak') {
					children.push(new TextRun({ break: 1 }));
				}
			}
			results.push(new Paragraph({ children }));
			break;
		}
		case 'bulletList': {
			for (const item of content) {
				if (item.type === 'listItem') {
					const itemContent = (item.content as Array<Record<string, unknown>>) ?? [];
					const paraTexts: InlineRun[] = [];
					for (const child of itemContent) {
						if (child.type === 'paragraph') {
							const subContent = (child.content as Array<Record<string, unknown>>) ?? [];
							for (const sc of subContent) {
								if (sc.type === 'text') paraTexts.push(textRunFromNode(sc, styles));
								else if (sc.type === 'hardBreak') paraTexts.push(new TextRun({ break: 1 }));
							}
						}
					}
					results.push(
						new Paragraph({
							bullet: { level: depth },
							children: paraTexts.length > 0 ? paraTexts : [new TextRun({ text: '' })]
						})
					);
				}
			}
			break;
		}
		case 'orderedList': {
			for (const item of content) {
				if (item.type === 'listItem') {
					const itemContent = (item.content as Array<Record<string, unknown>>) ?? [];
					const paraTexts: InlineRun[] = [];
					for (const child of itemContent) {
						if (child.type === 'paragraph') {
							const subContent = (child.content as Array<Record<string, unknown>>) ?? [];
							for (const sc of subContent) {
								if (sc.type === 'text') paraTexts.push(textRunFromNode(sc, styles));
								else if (sc.type === 'hardBreak') paraTexts.push(new TextRun({ break: 1 }));
							}
						}
					}
					results.push(
						new Paragraph({
							numbering: { reference: 'default-numbering', level: depth },
							children: paraTexts.length > 0 ? paraTexts : [new TextRun({ text: '' })]
						})
					);
				}
			}
			break;
		}
		case 'blockquote': {
			for (const child of content) {
				const childText = collectText(child);
				results.push(
					new Paragraph({
						indent: { left: 720 },
						children: [new TextRun({ text: childText, italics: true })]
					})
				);
			}
			break;
		}
		case 'codeBlock': {
			const text = collectText(node);
			results.push(
				new Paragraph({
					children: [new TextRun({ text, font: 'Courier New', size: 18 })]
				})
			);
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
			if (src?.startsWith('data:')) {
				const imgRun = headerImageToImageRun(src);
				if (imgRun) {
					results.push(new Paragraph({ children: [imgRun] }));
				}
			}
			break;
		}
		default: {
			for (const child of content) {
				const converted = await convertNode(child, styles);
				results.push(...converted);
			}
		}
	}

	return results;
}

export async function generateDocx(input: GenerateDocxInput): Promise<Buffer> {
	const { notes, styles } = input;
	const allParagraphs: Paragraph[] = [];

	const titlePara = new Paragraph({
		heading: HeadingLevel.HEADING_1,
		alignment: AlignmentType.CENTER,
		children: [
			new TextRun({
				text: input.title,
				font: styles.fonts.body.name ?? 'Calibri',
				size: 24,
				bold: true
			})
		]
	});
	allParagraphs.push(titlePara);
	allParagraphs.push(new Paragraph({ children: [] }));

	for (const note of notes) {
		if (note.title && note.title !== input.title) {
			allParagraphs.push(
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
			const converted = await convertNode(node, styles);
			for (const c of converted) {
				allParagraphs.push(c);
			}
		}

		allParagraphs.push(new Paragraph({ children: [] }));
	}

	const headerChildren: (Paragraph | import('docx').Table)[] = [];
	if (styles.headerImages?.length) {
		const imgRun = headerImageToImageRun(styles.headerImages[0]);
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
		children: allParagraphs as readonly (Paragraph | import('docx').Table)[]
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
		sections: [section]
	});

	return Buffer.from(await Packer.toBuffer(doc));
}
