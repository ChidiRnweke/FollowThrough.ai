import { expect, it } from 'vitest';
import { exportControllerFixture } from '$lib/testing/deliverables/fixtures/export-controller';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { PdfFontStore } from '$lib/server/stores/deliverables/pdf-fonts';
import { PdfDocumentService } from '$lib/server/services/deliverables/pdf';
import { NodePdfFontReader } from '$lib/server/adapters/deliverables/pdf-fonts';
import { PdfMakeDocumentWriter } from '$lib/server/adapters/deliverables/pdf-writer';
import { InMemoryPdfFontReader } from '$lib/testing/deliverables/fakes/pdf-fonts';
const setup = async () => {
	const fonts = new InMemoryPdfFontReader(await new NodePdfFontReader().read());
	const fixture = exportControllerFixture({
		pdfRendering: {
			state: new PdfFontStore(),
			fonts,
			preparation: new PdfDocumentService(),
			writer: new PdfMakeDocumentWriter()
		}
	});
	fixture.notes.notes = [noteBuilder()];
	return { fonts, controller: fixture.service };
};
it('renders with cached fonts after the font source becomes unavailable', async () => {
	const { fonts, controller } = await setup();
	await controller.previewDocument(testActor(), {
		projectId: testProjectId(),
		noteIds: [testNoteId()],
		title: 'Export'
	});
	fonts.failure = new Error('Font source unavailable');
	const rendered = await controller.previewDocument(testActor(), {
		projectId: testProjectId(),
		noteIds: [testNoteId()],
		title: 'Export'
	});
	expect(Buffer.from(rendered.data, 'base64').subarray(0, 4).toString()).toBe('%PDF');
});
it('retries a failed font read instead of retaining a rejected initialization', async () => {
	const { fonts, controller } = await setup();
	fonts.failure = new Error('Font source unavailable');
	const failure = await controller
		.previewDocument(testActor(), {
			projectId: testProjectId(),
			noteIds: [testNoteId()],
			title: 'Export'
		})
		.then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
	fonts.failure = undefined;
	const rendered = await controller.previewDocument(testActor(), {
		projectId: testProjectId(),
		noteIds: [testNoteId()],
		title: 'Export'
	});
	expect({
		failure,
		signature: Buffer.from(rendered.data, 'base64').subarray(0, 4).toString()
	}).toEqual({
		failure: 'Font source unavailable',
		signature: '%PDF'
	});
});
