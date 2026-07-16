import {
	AlignmentType,
	Document,
	Footer,
	Header,
	HeadingLevel,
	HorizontalRule,
	ImageRun,
	LevelFormat,
	NumberFormat,
	Packer,
	Paragraph,
	TextRun,
	type IHeaderOptions,
	type IFontOptions,
	type ISectionOptions
} from 'docx';
import type { ExtractedTemplateStyles, ProseMirrorDocument } from '$lib/models';

export interface GenerateDocxInput {
	readonly notes: readonly { title: string; document: ProseMirrorDocument }[];
	readonly styles: ExtractedTemplateStyles;
	readonly title: string;
}

function headerImageToImageRun(dataUrl: string): ImageRun | null {
	const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
	if (!match) return null;
	const buffer = Buffer.from(match[2], 'base64');
	return new ImageRun({ data: buffer, transformation: { width: 200, height: 60 } });
}

function headingFont(styles: ExtractedTemplateStyles, level: number): IFontOptions {
	const key = `Heading${level}`;
	const h = styles.fonts.heading[key];
	return {
		name: h?.name ?? 'Calibri',
		size: (h?.size ?? 12) * 2,
		bold: h?.bold ?? true,
		italic: h?.italic ?? false,
		color: h?.color ?? '000000'
	};
}

function bodyFont(styles: ExtractedTemplateStyles): IFontOptions {
	return {
		name: styles.fonts.body.name ?? 'Calibri',
		size: (styles.fonts.body.size ?? 11) * 2,
		color: styles.fonts.body.color ?? '000000'
	};
}

function textRunFromNode(
	node: Record<string, unknown>,
	styles: ExtractedTemplateStyles,
	isCode: boolean = false
): TextRun {
	const text = (node.text as string) ?? '';
	const options: IFontOptions = isCode
		? { name: 'Courier New', size: 18 }
		: bodyFont(styles);

	const marks = (node.marks as Array<{ type: string; attrs?: Record<string, unknown> }> | undefined) ?? [];
	let bold = false;
	let italic = false;

	for (const mark of marks) {
		if (mark.type === 'bold') bold = true;
		if (mark.type === 'italic') italic = true;
		if (mark.type === 'code') {
			options.name = 'Courier New';
			options.size = 18;
		}
	}

	return new TextRun({ text, bold, italics: italic, font: options });
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
): Promise<(Paragraph | import('docx').Table)[]> {
	const type = node.type as string;
	const content = (node.content as Array<Record<string, unknown>> | undefined) ?? [];
	const attrs = (node.attrs as Record<string, unknown> | undefined) ?? {};
	const results: (Paragraph | import('docx').Table)[] = [];

	switch (type) {
		case 'heading': {
			const level = (attrs.level as number) ?? 1;
			const text = collectText(node);
			const headingLevels: HeadingLevel[] = [
				HeadingLevel.HEADING_1,
				HeadingLevel.HEADING_2,
				HeadingLevel.HEADING_3,
				HeadingLevel.HEADING_4,
				HeadingLevel.HEADING_5,
				HeadingLevel.HEADING_6
			];
			results.push(
				new Paragraph({
					heading: headingLevels[Math.min(level - 1, 5)],
					children: [new TextRun({ text, font: headingFont(styles, level) })]
				})
			);
			break;
		}
		case 'paragraph': {
			const children: TextRun[] = [];
			for (const child of content) {
				if (child.type === 'text') {
					children.push(textRunFromNode(child, styles));
				} else if (child.type === 'hardBreak') {
					children.push(new TextRun({ break: 1 }));
				}
			}
			results.push(new Paragraph({ children: children.length > 0 ? children : [new TextRun({ text: '' })] }));
			break;
		}
		case 'bulletList': {
			for (const item of content) {
				if (item.type === 'listItem') {
					const itemResults = await Promise.all(
						((item.content as Array<Record<string, unknown>>) ?? []).map((c) =>
							flattenResults(convertNode(c, styles))
						)
					);
					itemResults.flat().forEach((p) => {
						results.push(
							new Paragraph({
								bullet: { level: depth },
								children: p instanceof Paragraph ? p.root.map((r) => (r as TextRun)) : [new TextRun({ text: '' })]
							})
						);
					});
				}
			}
			break;
		}
		case 'orderedList': {
			for (const item of content) {
				if (item.type === 'listItem') {
					const itemResults = await Promise.all(
						((item.content as Array<Record<string, unknown>>) ?? []).map((c) =>
							flattenResults(convertNode(c, styles))
						)
					);
					itemResults.flat().forEach((p, idx) => {
						results.push(
							new Paragraph({
								numbering: { reference: 'ordered', level: depth, format: NumberFormat.DECIMAL },
								children: p instanceof Paragraph ? p.root.map((r) => (r as TextRun)) : [new TextRun({ text: '' })]
							})
						);
					});
				}
			}
			break;
		}
		case 'blockquote': {
			for (const child of content) {
				const childResults = await flattenResults(convertNode(child, styles));
				for (const c of childResults) {
					if (c instanceof Paragraph) {
						results.push(
							new Paragraph({
								indent: { left: 720 },
								children: c.root.map((r) => r as TextRun)
							})
						);
					}
				}
			}
			break;
		}
		case 'codeBlock': {
			const textRuns: TextRun[] = [];
			for (const child of content) {
				if (child.type === 'text') {
					textRuns.push(new TextRun({ text: child.text as string, font: { name: 'Courier New', size: 18 } }));
				}
			}
			results.push(
				new Paragraph({
					children: textRuns.length > 0 ? textRuns : [new TextRun({ text: '' })],
					spacing: { before: 120, after: 120 }
				})
			);
			break;
		}
		case 'horizontalRule': {
			results.push(new Paragraph({ children: [new HorizontalRule()] }));
			break;
		}
		case 'image': {
			const src = attrs.src as string | undefined;
			if (src && src.startsWith('data:')) {
				const imageRun = headerImageToImageRun(src);
				if (imageRun) {
					results.push(new Paragraph({ children: [imageRun] }));
				}
			}
			break;
		}
		default: {
			for (const child of content) {
				results.push(...(await flattenResults(convertNode(child, styles))));
			}
		}
	}

	return results;
}

async function flattenResults(
	promise: Promise<(Paragraph | import('docx').Table)[]>
): Promise<(Paragraph | import('docx').Table)[]> {
	return await promise;
}

export async function generateDocx(input: GenerateDocxInput): Promise<Buffer> {
	const { notes, styles } = input;
	const allParagraphs: Paragraph[] = [];

	const titlePara = new Paragraph({
		heading: HeadingLevel.HEADING_1,
		alignment: AlignmentType.CENTER,
		children: [new TextRun({ text: input.title, font: headingFont(styles, 1) })]
	});
	allParagraphs.push(titlePara);
	allParagraphs.push(new Paragraph({ children: [] }));

	for (const note of notes) {
		if (note.title && note.title !== input.title) {
			allParagraphs.push(
				new Paragraph({
					heading: HeadingLevel.HEADING_2,
					children: [new TextRun({ text: note.title, font: headingFont(styles, 2) })]
				})
			);
		}

		const docContent = note.document.content ?? [];
		for (const node of docContent as Array<Record<string, unknown>>) {
			const converted = await convertNode(node, styles);
			for (const item of converted) {
				if (item instanceof Paragraph) {
					allParagraphs.push(item);
				}
			}
		}

		allParagraphs.push(new Paragraph({ children: [] }));
	}

	const headerOptions: IHeaderOptions = { children: [] };
	if (styles.headerImages?.length) {
		const imgRun = headerImageToImageRun(styles.headerImages[0]);
		if (imgRun) {
			headerOptions.children.push(new Paragraph({ children: [imgRun] }));
		}
	}

	const footerOptions = styles.footerContent
		? {
				children: [
					new Paragraph({
						alignment: AlignmentType.CENTER,
						children: [new TextRun({ text: styles.footerContent, font: { name: 'Calibri', size: 16 } })]
					})
				]
			}
		: undefined;

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
		...(footerOptions ? { footers: { default: new Footer(footerOptions) } } : {}),
		children: allParagraphs
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
