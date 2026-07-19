import AdmZip from 'adm-zip';
import type { ExtractedTemplateStyles } from '$lib/models';

interface HeadingStyle {
	name: string;
	size: number;
	bold: boolean;
	italic: boolean;
	color?: string;
}

interface BodyStyle {
	name: string;
	size: number;
	color?: string;
}

const DEFAULT_STYLES: ExtractedTemplateStyles = {
	fonts: {
		heading: {
			Heading1: { name: 'Calibri', size: 16, bold: true, italic: false, color: '#1F3864' },
			Heading2: { name: 'Calibri', size: 13, bold: true, italic: false, color: '#2E75B6' },
			Heading3: { name: 'Calibri', size: 12, bold: true, italic: false, color: '#2E75B6' },
			Heading4: { name: 'Calibri', size: 11, bold: true, italic: false, color: '#2E75B6' },
			Heading5: { name: 'Calibri', size: 11, bold: true, italic: true, color: '#2E75B6' },
			Heading6: { name: 'Calibri', size: 11, bold: true, italic: false, color: '#1F3864' }
		},
		body: { name: 'Calibri', size: 11, color: '#000000' }
	},
	pageMargins: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
	themeColors: {}
};

function parseDxa(value: string): number {
	const num = parseInt(value, 10);
	return Number.isNaN(num) ? 1440 : num;
}

function parseHalfPt(value: string): number {
	const num = parseInt(value, 10);
	return Number.isNaN(num) ? 11 : num / 2;
}

function parseColor(value: string): string | undefined {
	if (!value) return undefined;
	if (value.length === 6) return `#${value}`;
	if (value === 'auto') return undefined;
	return `#${value}`;
}

function extractHeadingStyles(stylesXml: string): Record<string, HeadingStyle> {
	const headingStyles: Record<string, HeadingStyle> = { ...DEFAULT_STYLES.fonts.heading };

	const styleRegex = /<w:style[^>]*w:styleId="(Heading\d+)"[^>]*>([\s\S]*?)<\/w:style>/g;
	let match: RegExpExecArray | null;

	while ((match = styleRegex.exec(stylesXml)) !== null) {
		const styleId = match[1];
		const styleContent = match[2];

		const rPrMatch = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(styleContent);
		if (!rPrMatch) continue;

		const rPr = rPrMatch[1];

		const fontMatch = /<w:rFonts[^>]*w:ascii="([^"]*)"[^>]*>/.exec(rPr);
		const szMatch = /<w:sz[^>]*w:val="(\d+)"[^>]*>/.exec(rPr);
		const colorMatch = /<w:color[^>]*w:val="([^"]*)"[^>]*>/.exec(rPr);
		const boldMatch = /<w:b[^>]*\/?>/.test(rPr);
		const italicMatch = /<w:i[^>]*\/?>/.test(rPr);

		headingStyles[styleId] = {
			name: fontMatch?.[1] ?? DEFAULT_STYLES.fonts.heading[styleId]?.name ?? 'Calibri',
			size: szMatch ? parseHalfPt(szMatch[1]) : (DEFAULT_STYLES.fonts.heading[styleId]?.size ?? 12),
			bold: boldMatch,
			italic: italicMatch,
			color: colorMatch ? parseColor(colorMatch[1]) : undefined
		};
	}

	return headingStyles;
}

function extractBodyStyle(stylesXml: string): BodyStyle {
	const normalMatch = /<w:style[^>]*w:styleId="Normal"[^>]*>([\s\S]*?)<\/w:style>/i.exec(stylesXml);
	if (!normalMatch) return DEFAULT_STYLES.fonts.body;

	const rPrMatch = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(normalMatch[1]);
	if (!rPrMatch) return DEFAULT_STYLES.fonts.body;

	const rPr = rPrMatch[1];
	const fontMatch = /<w:rFonts[^>]*w:ascii="([^"]*)"[^>]*>/.exec(rPr);
	const szMatch = /<w:sz[^>]*w:val="(\d+)"[^>]*>/.exec(rPr);
	const colorMatch = /<w:color[^>]*w:val="([^"]*)"[^>]*>/.exec(rPr);

	return {
		name: fontMatch?.[1] ?? DEFAULT_STYLES.fonts.body.name,
		size: szMatch ? parseHalfPt(szMatch[1]) : DEFAULT_STYLES.fonts.body.size,
		color: colorMatch ? parseColor(colorMatch[1]) : undefined
	};
}

function extractPageMargins(documentXml: string): ExtractedTemplateStyles['pageMargins'] {
	const sectPrMatch = /<w:sectPr[\s\S]*?>([\s\S]*?)<\/w:sectPr>/.exec(documentXml);
	if (!sectPrMatch) return DEFAULT_STYLES.pageMargins;

	const pgMarMatch = /<w:pgMar[^>]*\/?>/.exec(sectPrMatch[1]);
	if (!pgMarMatch) return DEFAULT_STYLES.pageMargins;

	const topMatch = /w:top="(\d+)"/.exec(pgMarMatch[0]);
	const bottomMatch = /w:bottom="(\d+)"/.exec(pgMarMatch[0]);
	const leftMatch = /w:left="(\d+)"/.exec(pgMarMatch[0]);
	const rightMatch = /w:right="(\d+)"/.exec(pgMarMatch[0]);

	return {
		top: topMatch ? parseDxa(topMatch[1]) : DEFAULT_STYLES.pageMargins.top,
		bottom: bottomMatch ? parseDxa(bottomMatch[1]) : DEFAULT_STYLES.pageMargins.bottom,
		left: leftMatch ? parseDxa(leftMatch[1]) : DEFAULT_STYLES.pageMargins.left,
		right: rightMatch ? parseDxa(rightMatch[1]) : DEFAULT_STYLES.pageMargins.right
	};
}

export async function extractTemplateStyles(docxBuffer: Buffer): Promise<ExtractedTemplateStyles> {
	const zip = new AdmZip(docxBuffer);

	let stylesXml = '';
	let documentXml = '';
	const headerImages: string[] = [];
	let footerContent: string | undefined;

	try {
		stylesXml = zip.readAsText('word/styles.xml');
	} catch {}

	try {
		documentXml = zip.readAsText('word/document.xml');
	} catch {}

	const heading = extractHeadingStyles(stylesXml);
	const body = extractBodyStyle(stylesXml);
	const pageMargins = extractPageMargins(documentXml);

	const mediaEntries = zip
		.getEntries()
		.filter((e) => e.entryName.startsWith('word/media/') && !e.isDirectory);
	for (const entry of mediaEntries) {
		const buffer = entry.getData();
		const ext = entry.entryName.split('.').pop()?.toLowerCase();
		const mimeType =
			ext === 'png'
				? 'image/png'
				: ext === 'jpg' || ext === 'jpeg'
					? 'image/jpeg'
					: ext === 'gif'
						? 'image/gif'
						: 'image/png';
		headerImages.push(`data:${mimeType};base64,${buffer.toString('base64')}`);
	}

	const headerFileRegex = /^word\/header\d*\.xml$/;
	const headerEntries = zip.getEntries().filter((e) => headerFileRegex.test(e.entryName));
	for (const entry of headerEntries) {
		const headerXml = entry.getData().toString('utf-8');
		const docPrMatch = /<wp:docPr[^>]*descr="([^"]*)"[^>]*\/>/.exec(headerXml);
		if (docPrMatch?.[1]) {
		}
	}

	const footerFileRegex = /^word\/footer\d*\.xml$/;
	const footerEntries = zip.getEntries().filter((e) => footerFileRegex.test(e.entryName));
	if (footerEntries.length > 0) {
		const footerXml = footerEntries[0].getData().toString('utf-8');
		const textMatches = footerXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
		if (textMatches) {
			footerContent = textMatches
				.map((t) => /<w:t[^>]*>([^<]*)<\/w:t>/.exec(t)?.[1] ?? '')
				.filter(Boolean)
				.join('');
		}
	}

	const themeColors: Record<string, string> = {};

	return {
		fonts: { heading, body },
		pageMargins,
		...(headerImages.length > 0 ? { headerImages } : {}),
		...(footerContent ? { footerContent } : {}),
		themeColors
	};
}
