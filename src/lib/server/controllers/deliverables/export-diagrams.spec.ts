import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import { DiagramRasterizer } from '$lib/server/services/deliverables/diagram-rendering';
import { generateDocx } from '$lib/server/services/deliverables/docx';
import { generatePdf } from '$lib/server/services/deliverables/pdf';
import { exportControllerFixture } from '$lib/testing/deliverables/fixtures/export-controller';
import {
	InMemoryDiagrams,
	drawioBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { ProseMirrorDocument } from '$lib/models/notes';

const mermaidDocument = (source: string): ProseMirrorDocument => ({
	type: 'doc',
	content: [{ type: 'mermaid', content: [{ type: 'text', text: source }] }]
});
const input = {
	projectId: testProjectId(),
	noteIds: [testNoteId()],
	title: 'Current diagrams',
	format: 'docx' as const
};
const media = (data: Uint8Array) =>
	new AdmZip(Buffer.from(data))
		.getEntries()
		.filter((entry) => !entry.isDirectory && entry.entryName.startsWith('word/media/'))
		.map((entry) => entry.getData().toString('base64'));

describe('current diagram images in document exports', () => {
	it('rejects a saved preview that belongs to an older draw.io revision', async () => {
		const diagrams = new InMemoryDiagrams();
		const diagram = drawioBuilder({
			currentRevision: 2,
			publishedRevision: 1,
			renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>'
		});
		diagrams.diagrams = [diagram];
		const { service, notes } = exportControllerFixture({ diagramReader: diagrams });
		notes.notes = [
			noteBuilder({
				document: { type: 'doc', content: [{ type: 'drawio', attrs: { diagramId: diagram.id } }] }
			})
		];
		await expect(service.generateDocument(testActor(), input)).rejects.toThrow(
			'preview is out of date'
		);
	});
	it('regenerates DOCX images from changed Mermaid source without browser renders', async () => {
		const { service, notes, storage } = exportControllerFixture({
			diagramRenderer: new DiagramRasterizer(),
			docxGenerator: generateDocx
		});
		notes.notes = [
			noteBuilder({ document: mermaidDocument('flowchart LR\n A[Before] --> B[Export]') })
		];
		const original = await service.generateDocument(testActor(), input);
		notes.notes = [
			noteBuilder({ document: mermaidDocument('flowchart TD\n A[After] --> B[Current document]') })
		];
		const regenerated = await service.regenerateArtifact(testActor(), original.artifact.id);
		const before = media(storage.objects.get(original.artifact.objectKey)!.data);
		const after = media(storage.objects.get(regenerated.artifact.objectKey)!.data);
		expect({ before: before.length, after: after.length, changed: before[0] !== after[0] }).toEqual(
			{ before: 1, after: 1, changed: true }
		);
	}, 30_000);
	it('embeds a generated diagram image in a PDF preview', async () => {
		const { service, notes } = exportControllerFixture({
			diagramRenderer: new DiagramRasterizer(),
			pdfGenerator: generatePdf
		});
		notes.notes = [noteBuilder({ document: mermaidDocument('flowchart LR\n A --> B') })];
		const result = await service.previewDocument(testActor(), input);
		expect(Buffer.from(result.data, 'base64').toString('latin1')).toContain('/Subtype /Image');
	}, 30_000);
	it('includes saved draw.io diagrams in bundled documents', async () => {
		const diagrams = new InMemoryDiagrams();
		const diagram = drawioBuilder({
			sourceNoteId: testNoteId(2),
			renderedSvg:
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 80"><rect width="180" height="80" fill="red"/></svg>'
		});
		diagrams.diagrams = [diagram];
		const { service, notes, storage } = exportControllerFixture({
			diagramReader: diagrams,
			diagramRenderer: new DiagramRasterizer(),
			docxGenerator: generateDocx
		});
		notes.notes = [
			noteBuilder({
				document: { type: 'doc', content: [{ type: 'drawio', attrs: { diagramId: diagram.id } }] }
			})
		];
		await service.generateBundle(testActor(), {
			...input,
			entries: [{ noteId: testNoteId(), path: 'Diagram' }]
		});
		const archive = new AdmZip(Buffer.from([...storage.objects.values()][0]!.data));
		expect(media(archive.getEntry('Diagram.docx')!.getData()).length).toBe(1);
	}, 30_000);
	it('rejects a draw.io reference owned by another project', async () => {
		const diagrams = new InMemoryDiagrams();
		const diagram = drawioBuilder({ projectId: testProjectId(2), sourceNoteId: undefined });
		diagrams.diagrams = [diagram];
		const { service, notes } = exportControllerFixture({ diagramReader: diagrams });
		notes.notes = [
			noteBuilder({
				document: { type: 'doc', content: [{ type: 'drawio', attrs: { diagramId: diagram.id } }] }
			})
		];
		await expect(service.generateDocument(testActor(), input)).rejects.toThrow(
			'unavailable in the source note’s project'
		);
	});
	it('reports a missing draw.io preview before persisting an incomplete export', async () => {
		const diagrams = new InMemoryDiagrams();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		const { service, notes } = exportControllerFixture({ diagramReader: diagrams });
		notes.notes = [
			noteBuilder({
				document: { type: 'doc', content: [{ type: 'drawio', attrs: { diagramId: diagram.id } }] }
			})
		];
		await expect(service.generateDocument(testActor(), input)).rejects.toThrow(
			'preview is missing'
		);
	});
});
