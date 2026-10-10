import { SyncResourceRulesService } from '$lib/services/sync/state';
import {
	DocumentExports,
	type BrowserDocumentExportInput
} from '$lib/controllers/deliverables/export';
import { ExportDiagrams } from '$lib/controllers/deliverables/diagrams';
import { DocumentExportStore } from '$lib/stores/deliverables/export.svelte';
import { ExportPreparationService } from '$lib/services/deliverables/export-preparation';
import { MermaidDiagrams } from '$lib/controllers/diagrams/mermaid';
import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
import { InMemoryMermaidRenderer } from '$lib/testing/diagrams/fakes/mermaid-render';
import { InMemoryMermaidOutput } from '$lib/testing/diagrams/fakes/mermaid-output';
import {
	InMemoryDocumentExportRemote,
	InMemoryDocumentPreviewUrls,
	InMemoryExportDiagramImages
} from '$lib/testing/deliverables/fakes/browser-export';
import { WorkspaceSessions } from '$lib/controllers/workspace/session';
import { WorkspaceSessionStore } from '$lib/stores/workspace/session.svelte';
import {
	InMemoryWorkspaceSessionEnvironment,
	InMemoryWorkspaceRecovery
} from '$lib/testing/sync/fakes/in-memory-session';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { defaultExportSettings } from '$lib/models/deliverables';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const { workspaceResourceKey } = new WorkspaceCommandRulesService();
import { syncEtag } from '$lib/models/sync';
export const browserExportFixture = async () => {
	const note = noteBuilder();
	const { resources, transport } = workspaceResourcesFixture(note.userId);
	transport.records.set(workspaceResourceKey({ type: 'notes', id: [note.id] }), {
		etag: syncEtag(1n),
		value: { type: 'notes', value: note }
	});
	const environment = new InMemoryWorkspaceSessionEnvironment({
		accountId: note.userId,
		agentDefaults: { chatModelId: 'provider/chat', visionModelId: 'provider/vision' },
		agentModels: [],
		numericDefaults: { webSearchMaxResults: 5, webSearchMaxTotalResults: 10, agentMaxTurns: 10 },
		agentAvailable: false
	});
	const workspace = new WorkspaceSessions(
		new WorkspaceSessionStore(),
		environment,
		{ create: () => resources },
		new InMemoryWorkspaceRecovery(),
		agentRulesFixture()
	);
	const renderer = new InMemoryMermaidRenderer();
	const images = new InMemoryExportDiagramImages();
	const remote = new InMemoryDocumentExportRemote();
	const urls = new InMemoryDocumentPreviewUrls();
	const controller = new DocumentExports(
		new SyncResourceRulesService(),
		new DocumentExportStore(),
		workspace,
		new ExportDiagrams(
			new ExportPreparationService(),
			new MermaidDiagrams(new MermaidThemeService(), renderer, new InMemoryMermaidOutput()),
			images
		),
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
	const loaded = await controller.open(note.projectId);
	return {
		controller,
		workspace,
		resources,
		transport,
		renderer,
		images,
		remote,
		urls,
		input,
		loaded,
		note,
		close: () => {
			controller.close();
			workspace.stop();
		}
	};
};
