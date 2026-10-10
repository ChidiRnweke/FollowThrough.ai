import { expect, it } from 'vitest';
import { PdfRendering } from './pdf';
import { PdfFontStore } from '$lib/server/stores/deliverables/pdf-fonts';
import { PdfDocumentService } from '$lib/server/services/deliverables/pdf';
import { NodePdfFontReader } from '$lib/server/adapters/deliverables/pdf-fonts';
import { PdfMakeDocumentWriter } from '$lib/server/adapters/deliverables/pdf-writer';
import { InMemoryPdfFontReader } from '$lib/testing/deliverables/fakes/pdf-fonts';
import { ExportPreparationService } from '$lib/services/deliverables/export-preparation';
const preparation = new ExportPreparationService();
const document = preparation.prepare({
	title: 'Export',
	notes: [
		{
			title: 'Note',
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A saved export.' }] }]
			}
		}
	]
});
const setup = async () => {
	const fonts = new InMemoryPdfFontReader(await new NodePdfFontReader().read());
	return {
		fonts,
		controller: new PdfRendering(
			new PdfFontStore(),
			fonts,
			new PdfDocumentService(),
			new PdfMakeDocumentWriter()
		)
	};
};
it('renders with cached fonts after the font source becomes unavailable', async () => {
	const { fonts, controller } = await setup();
	await controller.render(document);
	fonts.failure = new Error('Font source unavailable');
	const rendered = await controller.render(document);
	expect(rendered.subarray(0, 4).toString()).toBe('%PDF');
});
it('retries a failed font read instead of retaining a rejected initialization', async () => {
	const { fonts, controller } = await setup();
	fonts.failure = new Error('Font source unavailable');
	const failure = await controller.render(document).then(
		() => 'unexpected success',
		(error: Error) => error.message
	);
	fonts.failure = undefined;
	const rendered = await controller.render(document);
	expect({ failure, signature: rendered.subarray(0, 4).toString() }).toEqual({
		failure: 'Font source unavailable',
		signature: '%PDF'
	});
});
