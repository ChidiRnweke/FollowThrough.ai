import {
	DocumentExports,
	type BrowserDocumentExportInput
} from '$lib/controllers/deliverables/export';
import { DocumentExportStore } from '$lib/stores/deliverables/export.svelte';
import { ExportPreparationService } from '$lib/services/deliverables/export-preparation';
import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
import { InMemoryMermaidRenderer } from '$lib/testing/diagrams/fakes/mermaid-render';
import {
	InMemoryDocumentExportRemote,
	InMemoryDocumentPreviewUrls,
	InMemoryExportDiagramImages
} from '$lib/testing/deliverables/fakes/browser-export';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { defaultExportSettings } from '$lib/models/deliverables';

/** An open export dialog for one note, over an in-memory server and diagram renderer. */
export const browserExportFixture = () => {
	const note = noteBuilder();
	const renderer = new InMemoryMermaidRenderer();
	const images = new InMemoryExportDiagramImages();
	const remote = new InMemoryDocumentExportRemote();
	const urls = new InMemoryDocumentPreviewUrls();
	const controller = new DocumentExports(
		new DocumentExportStore(),
		new ExportPreparationService(),
		new MermaidThemeService(),
		renderer,
		images,
		remote,
		urls
	);
	const input: BrowserDocumentExportInput = {
		projectId: note.projectId,
		noteIds: [note.id],
		title: ' Review ',
		settings: { ...defaultExportSettings },
		documents: [note],
		diagrams: []
	};
	controller.open();
	return {
		controller,
		renderer,
		images,
		remote,
		urls,
		input,
		note,
		close: () => controller.close()
	};
};
