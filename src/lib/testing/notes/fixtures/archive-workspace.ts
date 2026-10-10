import { WorkspaceSessions } from '$lib/controllers/workspace/session';
import { WorkspaceSessionStore } from '$lib/stores/workspace/session.svelte';
import {
	InMemoryWorkspaceSessionEnvironment,
	InMemoryWorkspaceRecovery
} from '$lib/testing/sync/fakes/in-memory-session';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/models/sync';
export const archiveWorkspaceFixture = async () => {
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

	await workspace.start();
	return { workspace, resources, transport, note, close: () => workspace.stop() };
};
