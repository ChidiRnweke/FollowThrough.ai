import type { ExtractedTemplateStyles, ProseMirrorDocument } from '$lib/models';

export interface GeneratePdfInput {
	readonly notes: readonly { title: string; document: ProseMirrorDocument }[];
	readonly title: string;
	readonly styles?: ExtractedTemplateStyles;
}

function collectText(node: Record<string, unknown>): string {
	if (node.type === 'text') return (node.text as string) ?? '';
	if (node.content) {
		return (node.content as Array<Record<string, unknown>>).map(collectText).join('');
	}
	return '';
}

function textRunFromNode(node: Record<string, unknown>): { text: string; bold?: boolean; italics?: boolean } {
	const text = (node.text as string) ?? '';
	const marks = (node.marks as Array<{ type: string }> | undefined) ?? [];
	let bold = false;
	let italics = false;

	for (const mark of marks) {
		if (mark.type === 'bold') bold = true;
		if (mark.type === 'italic') italics = true;
	}

	return { text, ...(bold ? { bold: true } : {}), ...(italics ? { italics: true } : {}) };
}

function convertNode(node: Record<string, unknown>, depth: number = 0): unknown {
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
					const texts = itemContent.map((c) => convertNode(c)).flat();
					return { text: texts.length > 0 ? texts : '' };
				})
			};
		}
		case 'orderedList': {
			return {
				ol: content.map((item) => {
					const itemContent = (item.content as Array<Record<string, unknown>> | undefined) ?? [];
					const texts = itemContent.map((c) => convertNode(c)).flat();
					return { text: texts.length > 0 ? texts : '' };
				})
			};
		}
		case 'blockquote': {
			const blockContent = content.map((c) => convertNode(c)).flat();
			return blockContent.map((item) => {
				if (typeof item === 'object' && item !== null) {
					return { ...item as Record<string, unknown>, italics: true, margin: [20, 0, 20, 4] };
				}
				return { text: item, italics: true, margin: [20, 0, 20, 4] };
			});
		}
		case 'codeBlock': {
			const text = collectText(node);
			return { text, font: 'Courier', fontSize: 9, background: '#f5f5f5', margin: [0, 6, 0, 6] };
		}
		case 'horizontalRule': {
			return { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: '#cccccc' }], margin: [0, 8, 0, 8] };
		}
		case 'text': {
			return { text: node.text as string ?? '' };
		}
		case 'hardBreak': {
			return '\n';
		}
		default: {
			if (content.length > 0) {
				return content.map((c) => convertNode(c)).flat();
			}
			return [];
		}
	}
}

function convertDoc(doc: ProseMirrorDocument): unknown[] {
	const content = (doc.content as Array<Record<string, unknown>> | undefined) ?? [];
	const result: unknown[] = [];
	for (const node of content) {
		const converted = convertNode(node);
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
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const PdfPrinter: new (fonts: Record<string, unknown>) => { createPdfKitDocument: (doc: Record<string, unknown>) => NodeJS.ReadableStream } = require('pdfmake');

	const fonts = {
		Roboto: {
			normal: 'Helvetica',
			bold: 'Helvetica-Bold',
			italics: 'Helvetica-Oblique',
			bolditalics: 'Helvetica-BoldOblique'
		}
	};

	const content: unknown[] = [];

	content.push({ text: input.title, style: 'title', fontSize: 24, bold: true, alignment: 'center', margin: [0, 0, 0, 16] });

	for (const note of notes) {
		if (note.title && note.title !== input.title) {
			content.push({ text: note.title, style: 'header2', fontSize: 16, bold: true, margin: [0, 12, 0, 8] });
		}

		const docContent = convertDoc(note.document);
		content.push(...docContent);
		content.push({ text: '', margin: [0, 0, 0, 8] });
	}

	const pageMargins = input.styles?.pageMargins;

	const docDefinition: Record<string, unknown> = {
		content,
		defaultStyle: { font: 'Roboto', fontSize: 11 },
		styles: {
			header1: { fontSize: 18, bold: true, margin: [0, 12, 0, 6] },
			header2: { fontSize: 16, bold: true, margin: [0, 10, 0, 5] },
			header3: { fontSize: 14, bold: true, margin: [0, 8, 0, 4] },
			header4: { fontSize: 13, bold: true, margin: [0, 6, 0, 3] },
			header5: { fontSize: 12, bold: true, italics: true, margin: [0, 5, 0, 2] },
			header6: { fontSize: 11, bold: true, margin: [0, 4, 0, 2] }
		},
		fonts,
		pageMargins: pageMargins
			? [pageMargins.left / 20, pageMargins.top / 20, pageMargins.right / 20, pageMargins.bottom / 20]
			: [72, 72, 72, 72]
	};

	const printer = new PdfPrinter(fonts);
	const pdfDoc = printer.createPdfKitDocument(docDefinition) as NodeJS.ReadableStream & { end: () => void };

	return new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = [];
		pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
		pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
		pdfDoc.on('error', reject);
		pdfDoc.end();
	});
}
