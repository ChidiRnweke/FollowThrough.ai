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
import {
	InMemoryDeliverableWorkspace,
	InMemoryExportEnvironment
} from '$lib/testing/deliverables/fakes/workspace';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { defaultExportSettings } from '$lib/models/deliverables';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/models/sync';
import {
	CacheCommitService,
	WorkspaceProjectionService,
	OutboxEditingService
} from '$lib/services/sync/state';
import { ExportSettingsRuleService } from '$lib/services/deliverables/settings';
import { WorkspaceDraftService } from '$lib/services/workspace/draft';
import { WriteAncestryService } from '$lib/services/sync/ancestry';
import { WorkspaceFieldReplayService } from '$lib/services/sync/rebase';
export const browserExportFixture = async () => {
	const note = noteBuilder();
	const workspace = new InMemoryDeliverableWorkspace(note.userId);
	const transport = workspace.transport;
	transport.records.set(workspaceResourceKey({ type: 'notes', id: [note.id] }), {
		etag: syncEtag(1n),
		value: { type: 'notes', value: note }
	});
	const renderer = new InMemoryMermaidRenderer(),
		images = new InMemoryExportDiagramImages(),
		remote = new InMemoryDocumentExportRemote(),
		urls = new InMemoryDocumentPreviewUrls();
	const dependencies = {
		session: workspace,
		environment: workspace.environment,
		accounts: workspace.accounts,
		cacheMerge: new CacheCommitService(),
		projection: new WorkspaceProjectionService(),
		snapshots: new InMemoryExportEnvironment()
	};
	const settingsDependencies = {
		...dependencies,
		rules: new ExportSettingsRuleService(),
		drafts: new WorkspaceDraftService(),
		ancestry: new WriteAncestryService(),
		fields: new WorkspaceFieldReplayService(),
		editing: new OutboxEditingService()
	};
	const controller = new DocumentExports(new DocumentExportStore(), {
		...dependencies,
		preparation: new ExportPreparationService(),
		themes: new MermaidThemeService(),
		renderer,
		images,
		remote,
		urls
	});
	const input: BrowserDocumentExportInput = {
		projectId: note.projectId,
		noteIds: [note.id],
		title: ' Review ',
		settings: { ...defaultExportSettings },
		documents: [note],
		diagrams: []
	};
	const loaded = await controller.open(note.projectId, [note.id]);
	return {
		controller,
		workspace,
		transport,
		renderer,
		images,
		remote,
		urls,
		input,
		loaded,
		note,
		dependencies,
		settingsDependencies,
		pending: () => workspace.repository.list(note.userId),
		close: () => {
			controller.close();
			workspace.stop();
		}
	};
};
