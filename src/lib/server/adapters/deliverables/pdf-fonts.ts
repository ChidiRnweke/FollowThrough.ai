import { resolve } from 'node:path';
import { openSync } from 'fontkit';
import { ExternalServiceError } from '$lib/errors';
import type { PdfFontResources } from '$lib/models/deliverables';
import type { PdfFontReader } from '$lib/server/controllers/deliverables/pdf';
// Repo-shipped Noto TTFs retain the existing emoji, symbol and math fallback faces.
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
export class NodePdfFontReader implements PdfFontReader {
	async read(): Promise<PdfFontResources> {
		const directory = resolve(process.cwd(), 'assets/fonts');
		const files = Object.fromEntries(
			Object.entries(FONT_FILES).map(([family, styles]) => [
				family,
				Object.fromEntries(
					Object.entries(styles).map(([style, file]) => [style, resolve(directory, file)])
				)
			])
		);
		const coverage = new Map<string, ReadonlySet<number>>();
		for (const [family, styles] of Object.entries(files)) {
			const face = openSync(styles.normal!);
			if ('fonts' in face)
				throw new ExternalServiceError(`The bundled font ${family} is a collection, not a face.`);
			coverage.set(
				family,
				new Set(face.characterSet.filter((codepoint) => face.hasGlyphForCodePoint(codepoint)))
			);
		}
		return { directory, files, coverage };
	}
}
