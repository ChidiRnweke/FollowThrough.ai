import type { PdfFontCache } from '$lib/server/stores/deliverables/pdf-fonts';
import type {
	PdfFontReader,
	PdfDocumentWriter
} from '$lib/server/controllers/deliverables/controller';
import type { PdfDocumentPreparation } from '$lib/server/services/deliverables/pdf';
import { PdfFontStore } from '$lib/server/stores/deliverables/pdf-fonts';
import { NodePdfFontReader } from '$lib/server/adapters/deliverables/pdf-fonts';
import { PdfMakeDocumentWriter } from '$lib/server/adapters/deliverables/pdf-writer';
import { PdfDocumentService } from '$lib/server/services/deliverables/pdf';
export const createPdfRendering = (): {
	state: PdfFontCache;
	fonts: PdfFontReader;
	preparation: PdfDocumentPreparation;
	writer: PdfDocumentWriter;
} => ({
	state: new PdfFontStore(),
	fonts: new NodePdfFontReader(),
	preparation: new PdfDocumentService(),
	writer: new PdfMakeDocumentWriter()
});
